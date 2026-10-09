import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// Sin parser de YAML en las dependencias: expresiones acotadas sobre los archivos, que bastan para
// lo que se comprueba aquí (DEC-085).
const carpeta = path.resolve(import.meta.dirname, '../.github/workflows');
const archivos = readdirSync(carpeta).filter((a) => a.endsWith('.yml'));
const leer = (a: string) => readFileSync(path.join(carpeta, a), 'utf8');
/** Lo que la vigilancia mira en cada base de datos (docs/20 RV-78, DEC-104). */
const revisarBd = () => readFileSync(path.resolve(import.meta.dirname, '../.github/scripts/revisar-bd.sh'), 'utf8');

const programados = archivos.filter((a) => /^on:[\s\S]*?^\s{2}schedule:/m.test(leer(a))).sort();

function listas(a: string): string[][] {
  return [...leer(a).matchAll(/^\s+WORKFLOWS: (.+)$/gm)].map((m) => m[1]!.trim().split(/\s+/).sort());
}

describe('workflows programados (DEC-085)', () => {
  it('hay workflows programados que mantener', () => {
    expect(programados).toContain('mantener-activo.yml');
    expect(programados).toContain('vigilancia.yml');
  });

  it('mantener-activo.yml rehabilita todos los workflows con schedule', () => {
    const texto = leer('mantener-activo.yml');
    expect(texto).toMatch(/^\s{2}mantener-workflows:/m);
    expect(texto).toMatch(/actions: write/);
    expect(texto).toContain('/actions/workflows/$w/enable');
    expect(listas('mantener-activo.yml')).toEqual([programados]);
  });

  // docs/31 RV-138: abría «Supabase X no responde» y nunca la cerraba.
  it('mantener-activo.yml cierra su issue cuando el entorno vuelve a responder', () => {
    const texto = leer('mantener-activo.yml');
    const paso = texto.slice(texto.indexOf('- name: Cerrar la issue si vuelve a responder')).split(/\n\s{6}- /)[0]!;
    expect(paso).toContain('if: success()');
    expect(paso).toContain('titulo="Supabase $ENTORNO no responde"');
    expect(paso).toContain('select(.title == \\"$titulo\\")');
    expect(paso).toContain('gh issue close "$abierta"');
    // El mismo título que abre el paso de fallo.
    expect(texto).toContain('titulo="Supabase ${{ matrix.entorno }} no responde"');
    expect(texto).toContain('ENTORNO: ${{ matrix.entorno }}');
  });

  it('vigilancia.yml comprueba y rehabilita la misma lista', () => {
    const texto = leer('vigilancia.yml');
    const ls = listas('vigilancia.yml');
    expect(ls.length).toBe(2);
    for (const l of ls) expect(l).toEqual(programados);
    expect(texto).toContain('runs?event=schedule&per_page=1');
    expect(texto).toContain('/actions/workflows/$w/enable');
  });

  // docs/32 RV-201 (DEC-180): actions: write también borra artifacts, y el respaldo es uno, el único.
  // Solo lo tiene el trabajo que rehabilita, sin checkout; nada por defecto en el workflow.
  it.each(['vigilancia.yml', 'mantener-activo.yml'])(
    '%s: actions: write solo en el trabajo que rehabilita, sin checkout',
    (a) => {
      const texto = leer(a);
      expect(texto).toMatch(/^permissions: \{\}$/m);
      const sinComentarios = texto.replace(/^\s*#.*$/gm, '');
      expect(sinComentarios.match(/actions: write/g)).toHaveLength(1);
      const trabajos = sinComentarios.slice(sinComentarios.indexOf('\njobs:\n')).split(/\n(?= {2}[a-z-]+:\n)/);
      const conEscritura = trabajos.filter((t) => t.includes('actions: write'));
      expect(conEscritura).toHaveLength(1);
      expect(conEscritura[0]).toContain('/actions/workflows/$w/enable');
      expect(conEscritura[0]).not.toMatch(/actions\/checkout|secrets\.(?!GITHUB_TOKEN)|environment:/);
      // Cada trabajo declara sus permisos.
      const nombres = [...sinComentarios.matchAll(/^ {2}([a-z-]+):\n {4}/gm)].map((m) => m[1]);
      for (const t of trabajos.slice(1)) expect(t, nombres.join()).toMatch(/^ {4}permissions:/m);
    },
  );

  it('vigilancia.yml: el trabajo mirar, con la base de datos de producción, solo lee las ejecuciones', () => {
    const texto = leer('vigilancia.yml');
    const mirar = texto.slice(texto.indexOf('\n  mirar:\n'), texto.indexOf('\n  rehabilitar:\n'));
    expect(mirar).toMatch(/^ {4}permissions:\n {6}contents: read\n {6}actions: read\n {6}issues: write\n/m);
  });
});

describe('avisos.yml (RV-08)', () => {
  const texto = leer('avisos.yml');
  // docs/19 RV-52: el cron de GitHub es de mejor esfuerzo; ahora despacha el Worker cada 5 minutos.
  it('solo a mano, sin schedule: los avisos los despacha el Worker', () => {
    expect(texto).not.toMatch(/^\s{2}schedule:/m);
    expect(texto).toMatch(/^\s{2}workflow_dispatch:/m);
  });
  it('recorre producción y staging', () => {
    expect(texto).toMatch(/entorno: \[PROD, STAGING\]/);
    expect(texto).toContain("secrets[format('VIGILANCIA_SECRETO_{0}', matrix.entorno)]");
    expect(texto).toContain('X-Vigilancia');
  });
  it('no declara environment: production pediría aprobación en cada ejecución (DEC-071)', () => {
    expect(texto).not.toMatch(/^\s*environment:.*production/m);
    // La fila de producción, en prod-tareas (docs/31 RV-131, DEC-172).
    expect(texto).toContain("environment: ${{ matrix.entorno == 'PROD' && 'prod-tareas' || 'staging' }}");
  });
  it('repite mientras queden avisos, como mucho diez veces', () => {
    expect(texto).toContain('"quedan":true');
    expect(texto).toContain('seq 1 10');
  });
});

// docs/18 RV-38: fallos que se ocultaban solos.
describe('vigilancia y avisos sin fallos silenciosos (RV-38)', () => {
  it("ningún run usa -v con -c y una variable :'…' en la misma línea: psql no sustituye en -c", () => {
    const malas: string[] = [];
    const textos: [string, string][] = [
      ...archivos.map((a): [string, string] => [a, leer(a)]),
      ['revisar-bd.sh', revisarBd()],
    ];
    for (const [a, texto] of textos) {
      for (const [i, l] of texto.split('\n').entries()) {
        if (/psql\b/.test(l) && /\s-v\s/.test(l) && /\s-c\s/.test(l) && /:'\w+'/.test(l)) malas.push(`${a}:${i + 1}`);
      }
    }
    expect(malas).toEqual([]);
  });

  it('guardar las tareas no se traga el error con || true', () => {
    const texto = revisarBd();
    expect(texto).toContain('-f scripts/sql/guardar-tareas.sql');
    const linea = texto.split('\n').find((l) => l.includes('guardar-tareas.sql'))!;
    expect(linea).not.toMatch(/\|\|\s*true/);
  });

  it('la issue se abre o se cierra aunque falle la rehabilitación de workflows', () => {
    const texto = leer('vigilancia.yml');
    const paso = (nombre: string) => texto.slice(texto.indexOf(`- name: ${nombre}`)).split(/\n\s{6}- name:/)[0]!;
    expect(paso('Abrir o cerrar la issue de vigilancia')).toMatch(/^\s+if: always\(\)$/m);
    // docs/32 RV-201: la rehabilitación va en su propio trabajo, que no depende de mirar ni mirar de él.
    const rehabilitar = texto.slice(texto.indexOf('\n  rehabilitar:\n'));
    expect(rehabilitar).toContain('- name: Rehabilitar los workflows programados');
    expect(rehabilitar).not.toMatch(/^ {4}needs:/m);
    expect(texto.slice(texto.indexOf('\n  mirar:\n'), texto.indexOf('\n  rehabilitar:\n'))).not.toContain(
      '- name: Rehabilitar los workflows programados',
    );
  });

  // docs/19 RV-56: con HAY vacío (Comprobar no terminó) la issue se cerraba con "todo responde".
  it('la issue solo se cierra con HAY igual a no; sin resultado, se avisa de que no terminó', () => {
    const texto = leer('vigilancia.yml');
    const paso = texto.slice(texto.indexOf('- name: Abrir o cerrar la issue de vigilancia'));
    const cerrar = paso.indexOf('gh issue close');
    expect(paso.lastIndexOf(`if [ "$HAY" = 'no' ]; then`, cerrar)).toBeGreaterThan(-1);
    expect(paso).not.toContain(`if [ "$HAY" = 'si' ]; then\n`);
    expect(paso).toContain('no terminó');
    expect(paso).toContain('GH_REPO:');
  });

  it('"Comprobar" no ejecuta npm ci: el trabajo prepara solo psql', () => {
    const texto = leer('vigilancia.yml');
    const mirar = texto.slice(texto.indexOf('\n  mirar:'));
    expect(mirar).toMatch(/uses: \.\/\.github\/actions\/preparar\n\s+with:\n\s+npm: 'false'\n\s+psql: 'true'/);
    const comprobar = mirar.slice(mirar.indexOf('- name: Comprobar'), mirar.indexOf('- name: Rehabilitar'));
    expect(comprobar).not.toMatch(/\bnpm\b|\bnpx\b|\bnode\b/);
    const preparar = readFileSync(path.resolve(import.meta.dirname, '../.github/actions/preparar/action.yml'), 'utf8');
    expect(preparar).toMatch(/- if: inputs\.npm == 'true'\n\s+run: npm ci/);
  });

  it('la vigilancia pasa la lista de tareas esperadas a la consulta de pg_cron', () => {
    const texto = revisarBd();
    expect(texto).toContain('paste -sd, scripts/sql/tareas-esperadas.txt');
    expect(texto).toContain('-v esperadas="$esperadas"');
    expect(texto).toContain('select(.falta)');
  });

  it('avisos.yml no hace || echo 000: con la red caída daba 000000 y no reintentaba', () => {
    const texto = leer('avisos.yml');
    expect(texto).not.toContain('|| echo 000');
    expect(texto).toContain('.github/scripts/codigo-http.sh');
  });

  it('avisos.yml trata un 401 como aviso, no como fallo: el secreto de Pages vale al siguiente despliegue', () => {
    const texto = leer('avisos.yml');
    expect(texto).toMatch(/"\$codigo" = "401"/);
    expect(texto).toMatch(/::warning::.*401/);
  });
});

describe('codigo_http (RV-38)', () => {
  const codigo = (entrada: string) =>
    execFileSync('bash', ['-c', `source .github/scripts/codigo-http.sh; codigo_http "${entrada}"`], {
      cwd: path.resolve(import.meta.dirname, '..'),
      encoding: 'utf8',
    });

  it('deja el código tal cual', () => {
    expect(codigo('200')).toBe('200');
    expect(codigo('503')).toBe('503');
  });

  it('red caída: curl escribe 000 y sale con error; queda 000, no 000000', () => {
    expect(codigo('000')).toBe('000');
    expect(codigo('000000')).toBe('000');
  });

  it('sin salida, 000', () => {
    expect(codigo('')).toBe('000');
  });
});

// docs/19 P-03, DEC-096: producción es la versión de staging, y la vigilancia avisa si se queda atrás.
describe('paridad de producción (P-03)', () => {
  it('deploy-prod.yml comprueba la paridad después de desplegar y de anunciar las versiones', () => {
    const texto = leer('deploy-prod.yml');
    const paridad = texto.indexOf('- name: Paridad con develop');
    expect(paridad).toBeGreaterThan(-1);
    expect(paridad).toBeGreaterThan(texto.indexOf('wrangler pages deploy'));
    expect(paridad).toBeGreaterThan(texto.indexOf('npm run cargar-version-mapabase'));
    expect(texto.slice(paridad)).toContain('npm run paridad');
    // Sin historia completa no hay HEAD^2 con el que comparar el árbol.
    expect(texto).toMatch(/fetch-depth: 0/);
  });

  it('vigilancia.yml comprueba que producción está al día, sin contar la documentación', () => {
    const texto = leer('vigilancia.yml');
    expect(texto).toContain("origin/main..origin/develop -- . ':!docs'");
    expect(texto).toMatch(/"\$dias_atras" -gt 7/);
    expect(texto).toContain('haz P-02');
    expect(texto).toMatch(/fetch-depth: 0/);
  });
});

// docs/31 RV-136: un deploy de producción que falla avisa, y la vigilancia mira el último.
describe('deploy de producción fallido (RV-136)', () => {
  const prod = leer('deploy-prod.yml');
  const paso = (texto: string, nombre: string) => {
    const desde = texto.indexOf(`- name: ${nombre}`);
    expect(desde, nombre).toBeGreaterThan(-1);
    return texto.slice(desde).split(/\n\s{6}- /)[0]!;
  };

  /** El guion de un `run: |`, sin la sangría del YAML. */
  const guionDe = (p: string) =>
    p
      .slice(p.indexOf('run: |\n') + 'run: |\n'.length)
      .split('\n')
      .map((l) => l.replace(/^ {10}/, ''))
      .join('\n');
  const tieneJq = spawnSync('bash', ['-c', 'command -v jq'], { encoding: 'utf8' }).status === 0;
  /**
   * gh simulado con jq de verdad: `--jq` se aplica a la respuesta que toque, así que los filtros del
   * YAML se ejecutan. Lo que no es una lectura se anota en $ANOTADO.
   */
  const ghSimulado = [
    'gh() {',
    '  local filtro="" estado="" cuerpo="" a=("$@") i',
    '  for ((i = 0; i < ${#a[@]}; i++)); do',
    '    if [ "${a[i]}" = --jq ]; then filtro="${a[i+1]}"; fi',
    '    if [ "${a[i]}" = --status ]; then estado="${a[i+1]}"; fi',
    '    if [ "${a[i]}" = --body ]; then cuerpo="${a[i+1]}"; fi',
    '  done',
    '  if [ -n "$cuerpo" ]; then printf "%s" "$cuerpo" > "$ANOTADO.cuerpo"; fi',
    '  case "$1 $2" in',
    '    "api "*) printf "%s" "$JOBS" | jq -r "$filtro" ;;',
    '    "issue list") printf "%s" "$ISSUES" | jq -r "$filtro" ;;',
    '    "run list") if [ "$estado" = waiting ]; then printf "%s" "$ESPERANDO"; else printf "%s" "$TERMINADOS"; fi | jq -r "$filtro" ;;',
    '    *) echo "gh $1 $2 $3" >> "$ANOTADO" ;;',
    '  esac',
    '}',
  ].join('\n');
  const correr = (guion: string, datos: Record<string, string>) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'deploy-fallido-'));
    try {
      const anotado = path.join(dir, 'anotado');
      const r = spawnSync('bash', ['-e', '-c', `${ghSimulado}\n${guion}`], {
        encoding: 'utf8',
        env: {
          ...process.env,
          ANOTADO: anotado,
          GITHUB_SHA: 'a'.repeat(40),
          GH_REPO: 'o/r',
          REPO: 'o/r',
          RUN_ID: '1',
          EJECUCION: 'https://ejecucion',
          ...datos,
        },
      });
      const leerSi = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
      return { ...r, anotado: leerSi(anotado), cuerpo: leerSi(`${anotado}.cuerpo`) };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const JOBS = JSON.stringify({
    jobs: [
      {
        steps: [
          { name: 'Guarda de seguridad', conclusion: 'success' },
          { name: 'Paridad con develop', conclusion: 'failure' },
        ],
      },
    ],
  });
  const issue = (number: number, state: string, title = 'Deploy de producción fallido') => ({ number, state, title });

  it('con un paso fallido o cancelado, abre o reabre la issue y dice qué paso falló', () => {
    const p = paso(prod, 'Avisar del fallo');
    expect(p).toContain('if: failure() || cancelled()');
    expect(p).toContain('ESTADO: ${{ job.status }}');
    expect(p).toContain("titulo='Deploy de producción fallido'");
    // Después de todos los pasos que pueden fallar.
    expect(prod.indexOf('- name: Avisar del fallo')).toBeGreaterThan(prod.indexOf('npm run paridad'));
  });

  it.skipIf(!tieneJq)('sin issue, la crea con el paso que falló', () => {
    const r = correr(guionDe(paso(prod, 'Avisar del fallo')), { JOBS, ISSUES: '[]', ESTADO: 'failure' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.anotado).toBe('gh issue create --title\n');
    expect(r.cuerpo).toContain('ha terminado con **failure**, en: **Paridad con develop**');
    expect(r.cuerpo).toContain('`aaaaaaa`');
  });

  it.skipIf(!tieneJq)('si no puede leer los pasos, abre la issue igual y lo dice', () => {
    const r = correr(guionDe(paso(prod, 'Avisar del fallo')), { JOBS: 'no es json', ISSUES: '[]', ESTADO: 'failure' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.anotado).toBe('gh issue create --title\n');
    expect(r.cuerpo).toContain('no lo he podido saber');
  });

  it.skipIf(!tieneJq)('con la issue cerrada, la reabre y comenta; con otra de otro título, no la toca', () => {
    const ISSUES = JSON.stringify([issue(7, 'OPEN', 'Vigilancia diaria: algo no responde'), issue(5, 'CLOSED')]);
    const r = correr(guionDe(paso(prod, 'Avisar del fallo')), { JOBS, ISSUES, ESTADO: 'cancelled' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.anotado).toBe('gh issue reopen 5\ngh issue comment 5\n');
  });

  it.skipIf(!tieneJq)('con la issue abierta, solo comenta en ella, aunque haya otra cerrada más antigua', () => {
    const ISSUES = JSON.stringify([issue(3, 'CLOSED'), issue(9, 'OPEN')]);
    const r = correr(guionDe(paso(prod, 'Avisar del fallo')), { JOBS, ISSUES, ESTADO: 'failure' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.anotado).toBe('gh issue comment 9\n');
  });

  it('con el despliegue bien, cierra la issue de un fallo anterior', () => {
    const p = paso(prod, 'Cerrar el aviso de un fallo anterior');
    expect(p).toContain('if: success()');
    expect(p).toContain("titulo='Deploy de producción fallido'");
    expect(p).toContain('gh issue close');
  });

  it('tiene permiso para las issues y para leer los pasos de su ejecución', () => {
    expect(prod).toMatch(/^\s{2}issues: write$/m);
    expect(prod).toMatch(/^\s{2}actions: read$/m);
  });

  it.skipIf(!tieneJq)('con todo bien, cierra solo la issue abierta de ese título', () => {
    const ISSUES = JSON.stringify([issue(7, 'OPEN', 'Vigilancia diaria: algo no responde'), issue(9, 'OPEN')]);
    const r = correr(guionDe(paso(prod, 'Cerrar el aviso de un fallo anterior')), { ISSUES });
    expect(r.status, r.stderr).toBe(0);
    expect(r.anotado).toBe('gh issue close 9\n');
  });

  describe('la vigilancia mira el último deploy-prod', () => {
    const v = leer('vigilancia.yml');
    const bloque = v
      .slice(v.indexOf('# 9. El último despliegue'), v.indexOf('# 5. Se anota'))
      .split('\n')
      .map((l) => l.replace(/^ {10}/, ''))
      .join('\n');
    const ahora = Math.floor(Date.UTC(2026, 9, 7, 12) / 1000);
    const vigilar = (terminados: object[], esperando: object[] = []) => {
      const r = correr(
        ['problemas=()', `ahora=${ahora}`, bloque, 'printf "%s\\n" "${problemas[@]}"', 'echo FIN'].join('\n'),
        { TERMINADOS: JSON.stringify(terminados), ESPERANDO: JSON.stringify(esperando) },
      );
      expect(r.status, r.stderr).toBe(0);
      return r.stdout.replace(/\n?FIN\n$/, '').trim();
    };
    const SHA = 'b'.repeat(40);

    it('el bloque está entre los puntos 8 y 5', () => {
      expect(bloque).toContain('--status completed');
      expect(bloque).toContain('--status waiting');
    });

    it.skipIf(!tieneJq)('el último terminado con success: nada', () => {
      expect(vigilar([{ conclusion: 'success', headSha: SHA }])).toBe('');
    });

    it.skipIf(!tieneJq)('sin ningún deploy todavía: nada', () => {
      expect(vigilar([])).toBe('');
    });

    it.skipIf(!tieneJq)(
      'cuenta el que terminó más tarde: uno cancelado en cola antes de que el bueno acabe no avisa',
      () => {
        const terminados = [
          { conclusion: 'cancelled', headSha: 'd'.repeat(40), updatedAt: '2026-10-07T10:05:00Z' },
          { conclusion: 'success', headSha: SHA, updatedAt: '2026-10-07T11:00:00Z' },
        ];
        expect(vigilar(terminados)).toBe('');
        expect(vigilar([...terminados].reverse())).toBe('');
      },
    );

    it.skipIf(!tieneJq)('cancelado sin aprobar (0.8.0) o fallido: avisa con el commit', () => {
      for (const conclusion of ['cancelled', 'failure', 'timed_out']) {
        const p = vigilar([{ conclusion, headSha: SHA }]);
        expect(p).toContain(`(bbbbbbb) terminó con ${conclusion}`);
        expect(p).toContain('Deploy de producción fallido');
      }
    });

    it.skipIf(!tieneJq)('uno esperando la aprobación más de un día avisa; menos, no', () => {
      const hace = (h: number) => new Date((ahora - h * 3600) * 1000).toISOString().replace('.000', '');
      const bien = [{ conclusion: 'success', headSha: SHA }];
      expect(vigilar(bien, [{ createdAt: hace(30), headSha: 'c'.repeat(40) }])).toContain(
        'el despliegue de producción de ccccccc lleva 30 h esperando',
      );
      expect(vigilar(bien, [{ createdAt: hace(2), headSha: 'c'.repeat(40) }])).toBe('');
    });
  });
});

// docs/19 RV-52, DEC-097: el Worker de los avisos, su despliegue y su vigilancia.
describe('Worker hidrantes-avisos (RV-52)', () => {
  const toml = readFileSync(path.resolve(import.meta.dirname, '../workers/avisos/wrangler.toml'), 'utf8');

  it('wrangler.toml tiene el cron cada 5 minutos, sin superficie HTTP y sin secretos', () => {
    expect(toml).toMatch(/crons = \["\*\/5 \* \* \* \*"\]/);
    expect(toml).toMatch(/^name = "hidrantes-avisos"/m);
    expect(toml).toMatch(/^workers_dev = false/m);
    expect(toml).not.toMatch(/VIGILANCIA_SECRETO_(PROD|STAGING)\s*=/);
    expect(toml).toContain('https://hidrantes-albolote.pages.dev,https://hidrantes-albolote-staging.pages.dev');
  });

  // docs/20 RV-74: con la detección de cambios, un push fallido dejaba el Worker con el código viejo.
  it('deploy-staging.yml despliega el Worker tras Pages en cada push, sin mirar el diff, con su versión', () => {
    const texto = leer('deploy-staging.yml');
    const paso = texto.indexOf('- name: Desplegar el Worker de los avisos');
    expect(paso).toBeGreaterThan(texto.indexOf('wrangler pages deploy'));
    const cuerpo = texto.slice(paso, texto.indexOf('\n      - name:', paso + 10));
    expect(cuerpo).toContain(
      'npx wrangler deploy --config workers/avisos/wrangler.toml --var "VERSION_CODIGO:$version"',
    );
    expect(cuerpo).toContain('version=$(git log -1 --format=%H -- workers)');
    expect(cuerpo).not.toMatch(/git diff/);
    expect(texto).not.toContain('HEAD~1');
    // Con historia corta, git log -- workers daría otro commit.
    expect(texto).toMatch(/fetch-depth: 0/);
  });

  it('la vigilancia compara la versión del Worker con el último commit de workers/ en develop', () => {
    const texto = leer('vigilancia.yml');
    expect(texto).toContain('workers/scripts/hidrantes-avisos/settings');
    expect(texto).toContain('select(.name == "VERSION_CODIGO") | .text');
    expect(texto).toContain('version: ${{ steps.mirar.outputs.version }}');
    expect(texto).toContain('WORKER_VERSION: ${{ needs.worker.outputs.version }}');
    expect(texto).toContain('esperada=$(git log -1 --format=%H origin/develop -- workers');
    expect(texto).toContain('"$WORKER_VERSION" != "$esperada"');
  });

  it('con un token sin permiso de Workers (401/403), Pages se despliega igual y el paso lo avisa', () => {
    const texto = leer('deploy-staging.yml');
    const paso = texto.slice(texto.indexOf('- name: Desplegar el Worker de los avisos'));
    const cuerpo = paso.slice(0, paso.indexOf('\n      - name:', 10));
    expect(cuerpo).toMatch(/"\$codigo" = "401" \] \|\| \[ "\$codigo" = "403"/);
    expect(cuerpo).toContain('::warning::');
    expect(cuerpo).toContain('GITHUB_STEP_SUMMARY');
    expect(cuerpo).toContain('Workers Scripts: Edit');
    // Con solo lectura el token ve los Workers pero no puede desplegarlos: se mira el permiso de
    // edición, con la lista de nombres de los secretos (24 sep 2026).
    expect(cuerpo).toContain('workers/scripts/hidrantes-avisos/secrets');
    // La vigilancia sí lo cuenta como problema: dice el código HTTP en vez de "ninguno".
    expect(leer('vigilancia.yml')).toContain('cron="sin permiso (HTTP $codigo)"');
  });

  it('la vigilancia mira el cron del Worker y avisa de avisos parados más de 30 minutos', () => {
    const texto = leer('vigilancia.yml');
    expect(texto).toContain('workers/scripts/hidrantes-avisos/schedules');
    expect(texto).toContain('"${WORKER_CRON:-}" != "*/5 * * * *"');
    expect(revisarBd()).toContain("interval '30 minutes'");
    expect(revisarBd()).not.toContain("interval '2 hours'");
  });

  // docs/20 RV-78: en staging, Salud del sistema decía "todavía ninguno" porque solo se escribía en prod.
  // SUPABASE_DB_URL_STAGING no existe en el repositorio: staging se mira en su environment (DEC-104).
  it('la vigilancia mira y anota staging en su propio trabajo, con el secreto de su environment', () => {
    const texto = leer('vigilancia.yml');
    expect(texto).not.toContain('SUPABASE_DB_URL_STAGING');
    const staging = texto.slice(texto.indexOf('\n  staging:\n'), texto.indexOf('\n  mirar:\n'));
    expect(staging).toMatch(/^ {4}environment: staging$/m);
    expect(staging).toContain('BD: ${{ secrets.SUPABASE_DB_URL }}');
    expect(staging).toContain('revisar_bd staging "$BD"');
    expect(staging).toContain("'ultima_vigilancia'");
    expect(staging).toContain("'vigilancia_ok'");
    expect(staging).toContain("echo 'problemas<<FIN_PROBLEMAS'");
    const mirar = texto.slice(texto.indexOf('\n  mirar:\n'));
    expect(mirar).toContain('needs: [worker, staging]');
    expect(mirar).toContain('revisar_bd produccion "$BD"');
    expect(mirar).toContain('STAGING_PROBLEMAS: ${{ needs.staging.outputs.problemas }}');
    expect(mirar).toContain('"${STAGING_RESULTADO:-}" != success');
  });

  // 24 sep 2026, run 36055437810: «git log … | head -1» terminó con 141 (SIGPIPE) bajo bash -e y
  // pipefail, y la vigilancia se quedó sin resultado.
  it('ningún paso de la vigilancia corta una tubería con head', () => {
    expect(leer('vigilancia.yml')).not.toMatch(/\|\s*head\b/);
    expect(revisarBd()).not.toMatch(/\|\s*head\b/);
  });

  it('avisos.yml ya no está en las listas de workflows programados', () => {
    for (const a of ['mantener-activo.yml', 'vigilancia.yml']) {
      for (const lista of listas(a)) expect(lista).not.toContain('avisos.yml');
    }
  });
});

// docs/trabajo-en-paralelo.md §9, DEC-100: e2e en tres partes, puertos por sesión y PR de
// documentación sin e2e ni SQL.
describe('CI en paralelo (PAR-01)', () => {
  const ci = leer('ci.yml');
  const raiz = path.resolve(import.meta.dirname, '..');
  /** El bloque de un trabajo de ci.yml, desde su id hasta el siguiente. */
  const trabajo = (id: string) => {
    const desde = ci.indexOf(`\n  ${id}:\n`);
    expect(desde, `trabajo ${id}`).toBeGreaterThan(-1);
    const resto = ci.slice(desde + 1);
    const fin = resto.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
    return fin === -1 ? resto : resto.slice(0, fin + 1);
  };

  it('los checks obligatorios de arranque.ts son nombres de trabajo de ci.yml', () => {
    const arranque = readFileSync(path.join(raiz, 'scripts/arranque.ts'), 'utf8');
    const lista = /const CHECKS_OBLIGATORIOS = \[([^\]]+)\]/.exec(arranque)![1]!;
    const checks = [...lista.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    expect(checks).toEqual(['ci-calidad', 'ci-sql', 'ci-e2e']);
    const nombres = [...ci.matchAll(/^ {4}name: (.+)$/gm)].map((m) => m[1]!.trim());
    for (const c of checks) expect(nombres).toContain(c);
  });

  it('el agregador ci-e2e corre siempre, depende de las partes y solo acepta success y skipped', () => {
    const t = trabajo('e2e');
    expect(t).toMatch(/^ {4}name: ci-e2e$/m);
    expect(t).toMatch(/^ {4}if: always\(\)$/m);
    expect(t).toContain('needs: [cambios, e2e-parte, e2e-rendimiento]');
    expect(t).toContain('success | skipped) ;;');
  });

  it('la matriz tiene tres partes y cada una usa --shard', () => {
    const t = trabajo('e2e-parte');
    expect(t).toContain('parte: [1, 2, 3]');
    expect(t).toContain('fail-fast: false');
    expect(t).toContain('--grep-invert @rendimiento --fully-parallel --shard=${{ matrix.parte }}/3');
    expect(t).toContain('name: playwright-report-${{ matrix.parte }}');
  });

  // docs/32 RV-205: publicar exige ci.yml en verde con el commit de la marca; un push detrás no la cancela.
  it('solo se cancela la CI anterior de un PR, nunca la de un push', () => {
    expect(leer('ci.yml')).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
  });

  // docs/32 RV-206: ci-sql es obligatorio (protección de main) y en un PR a main no se salta nunca.
  it('en un PR a main se prueba todo, aunque solo traiga documentación', () => {
    expect(trabajo('cambios')).toContain('if [ "$EVENTO" != pull_request ] || [ "$BASE" = main ]; then');
  });

  it('e2e y SQL se saltan sin código; ci-calidad corre siempre y mira las migraciones en los PR', () => {
    for (const id of ['sql', 'e2e-parte', 'e2e-rendimiento']) {
      expect(trabajo(id)).toContain("if: needs.cambios.outputs.codigo == 'true'");
    }
    const calidad = trabajo('calidad');
    expect(calidad).not.toMatch(/^ {4}if:/m);
    expect(calidad).toContain('fetch-depth: 0');
    expect(calidad).toContain('scripts/comprobar-migraciones-nuevas.ts --base');
    expect(calidad).toContain("if: github.event_name == 'pull_request'");
    expect(trabajo('e2e-rendimiento')).toContain('--grep @rendimiento --workers=1');
  });

  it('los navegadores salen de la caché por la versión de @playwright/test y los navegadores', () => {
    const accion = readFileSync(path.join(raiz, '.github/actions/navegadores/action.yml'), 'utf8');
    expect(accion).toContain("packages['node_modules/@playwright/test'].version");
    expect(accion).toContain('path: ~/.cache/ms-playwright');
    expect(accion).toContain(
      'key: playwright-${{ runner.os }}-${{ steps.version.outputs.version }}-${{ steps.version.outputs.navegadores }}',
    );
    expect(accion).toContain('default: chromium firefox');
    expect(accion).toContain('con_reintento 200 npx playwright install $NAVEGADORES');
    expect(accion).toContain('instalar_bibliotecas ~/debs-playwright $NAVEGADORES');
    // Las bibliotecas del sistema, con caché por imagen del runner (el espejo de Ubuntu, 9 oct 2026).
    expect(accion).toContain('path: ~/debs-playwright');
    expect(accion).toContain(
      'key: debs-playwright-${{ steps.version.outputs.imagen }}-${{ steps.version.outputs.version }}-${{ steps.version.outputs.navegadores }}',
    );
    expect(accion).toContain('${ImageOS:-sin-imagen}-${ImageVersion:-0}');
    expect(accion).not.toContain('--with-deps');
    // Dos intentos con su KILL a los 15 s caben en los 8 minutos del paso con margen para la caché
    // y para escribir el ::error:: final.
    for (const m of accion.matchAll(/con_reintento (\d+) /g)) expect(2 * (Number(m[1]) + 15)).toBeLessThanOrEqual(450);
  });

  // docs/32 RV-207: un paso de instalar navegadores colgado no puede gastar la espera de publicar.
  it('cada instalación de navegadores va por la acción, con timeout-minutes: 9', () => {
    const usos: string[] = [];
    for (const archivo of readdirSync(path.join(raiz, '.github/workflows')).filter((a) => a.endsWith('.yml'))) {
      const t = readFileSync(path.join(raiz, '.github/workflows', archivo), 'utf8');
      expect(t, archivo).not.toMatch(/npx playwright install/);
      for (const m of t.matchAll(/uses: \.\/\.github\/actions\/navegadores\n(\s+)(.*)\n/g)) {
        usos.push(`${archivo}: ${m[2]}`);
      }
    }
    expect(usos.length).toBeGreaterThanOrEqual(5);
    for (const u of usos) expect(u).toMatch(/: timeout-minutes: 9$/);
  });

  // Run 37893324608: el apt-get del primer intento cortado seguía con el cerrojo de dpkg.
  it('antes del segundo intento se libera apt', () => {
    const s = readFileSync(path.join(raiz, '.github/scripts/instalar-navegadores.sh'), 'utf8');
    expect(s).toMatch(/liberar_apt\(\) \{[\s\S]*pkill -x apt-get[\s\S]*dpkg --configure -a/);
    expect(s).toMatch(/intento \$intento de 2\)"\n\s+\[ "\$intento" = 1 \] && liberar_apt/);
  });

  it('playwright.config.ts no tiene el puerto 4173 fuera del valor por defecto de PW_PUERTO', () => {
    const config = readFileSync(path.join(raiz, 'playwright.config.ts'), 'utf8');
    expect(config).toContain('Number(process.env.PW_PUERTO ?? 4173)');
    expect(config.replace('process.env.PW_PUERTO ?? 4173', '')).not.toContain('4173');
    const vite = readFileSync(path.join(raiz, 'vite.config.ts'), 'utf8');
    expect(vite).toContain('port: Number(process.env.VITE_PUERTO ?? 5173)');
  });
});

describe('con_reintento (RV-207)', () => {
  const raiz = path.resolve(import.meta.dirname, '..');
  const dir = mkdtempSync(path.join(tmpdir(), 'navegadores-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  /** npx simulado: cuenta los intentos; el comportamiento de cada uno, en la lista. */
  const probar = (comportamientos: ('bien' | 'mal' | 'cuelga')[], tope = 2) => {
    const contador = path.join(dir, `n-${Math.random().toString(36).slice(2)}`);
    writeFileSync(contador, '0');
    const npx = [
      '#!/usr/bin/env bash',
      `n=$(( $(cat '${contador.replace(/\\/g, '/')}') + 1 )); echo $n > '${contador.replace(/\\/g, '/')}'`,
      `c=(${comportamientos.join(' ')}); case "\${c[$((n-1))]}" in bien) exit 0 ;; mal) exit 1 ;; cuelga) exec sleep 30 ;; esac`,
    ].join('\n');
    writeFileSync(path.join(dir, 'npx'), npx + '\n', { mode: 0o755 });
    const r = spawnSync(
      'bash',
      [
        '-c',
        `export PATH="$(cygpath -u "$1" 2>/dev/null || printf %s "$1"):$PATH"; source .github/scripts/instalar-navegadores.sh; con_reintento ${tope} npx playwright install chromium`,
        '_',
        dir.replace(/\\/g, '/'),
      ],
      { cwd: raiz, encoding: 'utf8', timeout: 60_000 },
    );
    return { codigo: r.status, salida: r.stdout + r.stderr, intentos: Number(readFileSync(contador, 'utf8').trim()) };
  };

  it('a la primera, un solo intento', () => {
    const r = probar(['bien']);
    expect(r.codigo).toBe(0);
    expect(r.intentos).toBe(1);
  });

  it('si falla una vez, lo reintenta y sigue', () => {
    const r = probar(['mal', 'bien']);
    expect(r.codigo).toBe(0);
    expect(r.intentos).toBe(2);
    expect(r.salida).toContain('intento 1 de 2');
  });

  it('si se cuelga, lo corta por el tope y lo reintenta', () => {
    const inicio = Date.now();
    const r = probar(['cuelga', 'bien'], 1);
    expect(r.codigo).toBe(0);
    expect(r.intentos).toBe(2);
    expect(Date.now() - inicio).toBeLessThan(20_000);
  });

  it('dos fallos: el paso falla, no sigue sin navegadores', () => {
    const r = probar(['mal', 'mal']);
    expect(r.codigo).toBe(1);
    expect(r.intentos).toBe(2);
    expect(r.salida).toContain('::error::');
  });
});

// 9 oct 2026: el espejo de Ubuntu se pasó del tope cuatro veces en un día. Las bibliotecas salen de los
// .deb guardados si bastan, y si no, de la red; con npx, sudo y dpkg simulados.
describe('instalar_bibliotecas', () => {
  const raiz = path.resolve(import.meta.dirname, '..');
  const unix = (p: string) => p.replace(/\\/g, '/');
  const probar = (o: { debsEnCaché: boolean; bastan: boolean; descarga: boolean; instalaFalla?: boolean }) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bibliotecas-'));
    const bin = path.join(dir, 'bin');
    const cache = path.join(dir, 'debs');
    const archivos = path.join(dir, 'archivos');
    const registro = path.join(dir, 'registro');
    for (const d of [bin, archivos]) mkdirSync(d, { recursive: true });
    if (o.debsEnCaché) {
      mkdirSync(cache);
      writeFileSync(path.join(cache, 'libuno.deb'), 'x');
    }
    if (o.descarga) writeFileSync(path.join(archivos, 'libdos.deb'), 'x');
    const anotar = `echo "$(basename "$0") $*" >> '${unix(registro)}'`;
    const scripts: Record<string, string> = {
      // --dry-run: 0 si no falta nada (apt-get -s sin red); install-deps sin --dry-run es la red.
      npx: `${anotar}\ncase "$*" in *--dry-run*) exit ${o.bastan ? 0 : 1} ;; *install-deps*) exit ${o.instalaFalla ? 1 : 0} ;; esac`,
      sudo: `${anotar}\n"$@"`,
      dpkg: `${anotar}\nexit 0`,
      pkill: 'exit 1',
      pgrep: 'exit 1',
    };
    for (const [n, c] of Object.entries(scripts))
      writeFileSync(path.join(bin, n), `#!/usr/bin/env bash\n${c}\n`, { mode: 0o755 });
    const r = spawnSync(
      'bash',
      [
        '-c',
        `export PATH="$(cygpath -u "$1" 2>/dev/null || printf %s "$1"):$PATH"; export APT_ARCHIVOS="$3"; source .github/scripts/instalar-navegadores.sh; instalar_bibliotecas "$2" chromium firefox`,
        '_',
        unix(bin),
        unix(cache),
        unix(archivos),
      ],
      { cwd: raiz, encoding: 'utf8', timeout: 60_000 },
    );
    const llamadas = existsSync(registro) ? readFileSync(registro, 'utf8').trim().split('\n') : [];
    const guardados = existsSync(cache) ? readdirSync(cache).sort() : [];
    rmSync(dir, { recursive: true, force: true });
    return { codigo: r.status, salida: r.stdout + r.stderr, llamadas, guardados };
  };
  const deRed = (l: string[]) => l.filter((x) => /^npx playwright install-deps chromium firefox$/.test(x)).length;

  it('con los .deb guardados y sin que falte nada, no baja nada', () => {
    const r = probar({ debsEnCaché: true, bastan: true, descarga: false });
    expect(r.codigo).toBe(0);
    expect(r.llamadas.some((l) => /^dpkg -i .*libuno\.deb$/.test(l))).toBe(true);
    expect(deRed(r.llamadas)).toBe(0);
    expect(r.salida).toContain('desde la caché');
  });

  it('si con los guardados aún falta algo, instala de la red', () => {
    const r = probar({ debsEnCaché: true, bastan: false, descarga: true });
    expect(r.codigo).toBe(0);
    expect(deRed(r.llamadas)).toBe(1);
    expect(r.salida).toContain('::warning::');
  });

  it('sin caché, instala de la red y guarda los .deb para la próxima', () => {
    const r = probar({ debsEnCaché: false, bastan: false, descarga: true });
    expect(r.codigo).toBe(0);
    expect(deRed(r.llamadas)).toBe(1);
    expect(r.guardados).toEqual(['libdos.deb']);
  });

  it('si la red falla dos veces, el paso falla', () => {
    const r = probar({ debsEnCaché: false, bastan: false, descarga: false, instalaFalla: true });
    expect(r.codigo).toBe(1);
    expect(deRed(r.llamadas)).toBe(2);
    expect(r.guardados).toEqual([]);
  });
});

describe('hay_codigo (PAR-01)', () => {
  const hay = (archivos: string[]) =>
    execFileSync('bash', ['-c', 'source .github/scripts/hay-codigo.sh; hay_codigo'], {
      cwd: path.resolve(import.meta.dirname, '..'),
      input: archivos.join('\n') + '\n',
      encoding: 'utf8',
    }).trim();

  it('solo docs/ y *.md fuera de src/ no es código', () => {
    expect(hay(['docs/12-decisiones.md', 'docs/07-mockups-app.html', 'README.md', 'e2e/LEEME.md'])).toBe('false');
  });

  it('un archivo de código, un .md dentro de src/ o CHANGELOG con package.json, sí', () => {
    expect(hay(['docs/12-decisiones.md', 'src/lib/textos.ts'])).toBe('true');
    expect(hay(['src/lib/LEEME.md'])).toBe('true');
    expect(hay(['CHANGELOG.md', 'package.json'])).toBe('true');
    expect(hay(['.github/workflows/ci.yml'])).toBe('true');
  });

  it('sin archivos se prueba todo', () => {
    expect(hay([])).toBe('true');
  });
});

// docs/20 RV-78 y DEC-104: la vigilancia de cada base, con bash -e como en Actions y un psql simulado.
describe('revisar_bd (RV-78)', () => {
  const raiz = path.resolve(import.meta.dirname, '..');
  const tieneJq = spawnSync('bash', ['-c', 'command -v jq'], { encoding: 'utf8' }).status === 0;
  /** psql simulado: responde según la consulta; `tareas` es lo que da tareas-programadas.sql. */
  /** `falla`: un trozo de la consulta con el que psql sale con error (docs/31 RV-138). */
  /** `intentos`: fallos, bloqueos de todo el grupo y móviles frenados con el código bueno (24 h). */
  const correr = (entorno: string, tareas: string, falla = '', intentos = '0 0 0') => {
    const guion = [
      'set -uo pipefail',
      `psql() {
        if [ -n "$FALLA" ] && [[ "$*" == *"$FALLA"* ]]; then echo 'ERROR: simulado' >&2; return 1; fi
        case "$*" in
          *tareas-programadas.sql*) printf '%s' "$TAREAS" ;;
          *guardar-tareas.sql*) echo "guardado $*" >> "$ANOTADO" ;;
          *ultimo_respaldo*) echo 3 ;;
          *fn_espacio*) echo 'storage 10 800 f 50 400 f 70 0 120 500 f 80 50 5 1 64 ok 0' ;;
          *notificaciones*) echo 0 ;;
          *intentos_codigo*) echo "$INTENTOS" ;;
          *) echo 1 ;;
        esac
      }`,
      'problemas=()',
      'source .github/scripts/revisar-bd.sh',
      `revisar_bd ${entorno} postgresql://simulada`,
      'printf "%s\\n" "${problemas[@]}"',
      'echo FIN',
    ].join('\n');
    const dir = mkdtempSync(path.join(tmpdir(), 'vigilancia-'));
    try {
      const r = spawnSync('bash', ['-e', '-c', guion], {
        cwd: raiz,
        encoding: 'utf8',
        // docs/22 RV-90: el JSON de las tareas va a RUNNER_TEMP, no a la raíz del repositorio.
        env: {
          ...process.env,
          TAREAS: tareas,
          ANOTADO: path.join(dir, 'anotado'),
          RUNNER_TEMP: dir,
          FALLA: falla,
          INTENTOS: intentos,
        },
      });
      const archivo = `tareas-${entorno}.json`;
      return {
        salida: r.stdout,
        codigo: r.status,
        enRaiz: existsSync(path.join(raiz, archivo)),
        enTemporal: existsSync(path.join(dir, archivo)),
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const BIEN = JSON.stringify([{ tarea: 'hidrantes_purgar_errores', falta: false, problema: false }]);

  // docs/22 RV-90: tras npm test quedaban tareas-produccion.json y tareas-staging.json en la raíz.
  it('el JSON de las tareas no queda en la raíz del repositorio, sino en RUNNER_TEMP', () => {
    for (const entorno of ['produccion', 'staging']) {
      const r = correr(entorno, BIEN);
      expect(r.enRaiz, entorno).toBe(false);
      expect(r.enTemporal, entorno).toBe(true);
    }
  });
  const FALTA = JSON.stringify([{ tarea: 'hidrantes_purgar_errores', falta: true, problema: true }]);

  it.skipIf(!tieneJq)('con todo bien, bash -e llega al final sin problemas, en los dos entornos', () => {
    for (const entorno of ['produccion', 'staging']) {
      const r = correr(entorno, BIEN);
      expect(r.codigo, entorno).toBe(0);
      expect(r.salida.trim(), entorno).toBe('FIN');
    }
  });

  it.skipIf(!tieneJq)('en staging, una tarea que falta sale con «staging:» delante', () => {
    const r = correr('staging', FALTA);
    expect(r.codigo).toBe(0);
    expect(r.salida).toContain('staging: faltan tareas programadas de pg_cron: hidrantes_purgar_errores');
    expect(r.salida.trim().endsWith('FIN')).toBe(true);
  });

  // docs/31 RV-138: con `|| echo 0`, una consulta que fallaba contaba como «todo bien».
  it.skipIf(!tieneJq).each([
    ['notificaciones', 'produccion', 'no se pueden contar los avisos push sin salir'],
    ['notificaciones', 'staging', 'staging: no se pueden contar los avisos push sin salir'],
    ['fn_espacio', 'produccion', 'no se puede medir el espacio de fotos ni el de la base de datos'],
    ['intentos_codigo', 'produccion', 'no se pueden leer los intentos del código de acceso'],
  ])('si falla la consulta de %s (%s), es un problema, y sigue con lo demás', (falla, entorno, problema) => {
    const r = correr(entorno, BIEN, falla);
    expect(r.codigo).toBe(0);
    expect(r.salida).toContain(problema);
    expect(r.salida.trim().endsWith('FIN')).toBe(true);
  });

  // docs/33 RV-300: más de 5 móviles con el código bueno frenados por el tope de entradas en 24 h.
  it.skipIf(!tieneJq)('con más de 5 móviles frenados con el código bueno, problema y aviso a jefatura', () => {
    const r = correr('produccion', BIEN, '', '0 0 6');
    expect(r.codigo).toBe(0);
    expect(r.salida).toContain('Hay voluntarios que no pueden entrar: abre la entrada 24 h en Ajustes (6 móviles');
    // El psql simulado responde 0 al aviso: nadie suscrito.
    expect(r.salida).toContain('nadie ha recibido el aviso de que hay voluntarios que no pueden entrar');
    expect(correr('produccion', BIEN, '', '0 0 5').salida.trim()).toBe('FIN');
    // Una base sin 0044 da dos columnas: no es un problema.
    expect(correr('produccion', BIEN, '', '0 0').salida.trim()).toBe('FIN');
    // Con la entrada ya abierta no se pide abrirla.
    expect(correr('produccion', BIEN, '', '0 0 6 t').salida.trim()).toBe('FIN');
    expect(correr('produccion', BIEN, '', '0 0 6 f').salida).toContain('Hay voluntarios que no pueden entrar');
  });

  it('la consulta de los frenados no falla en una base sin la columna codigo_correcto (0044)', () => {
    const guion = readFileSync(path.join(raiz, '.github/scripts/revisar-bd.sh'), 'utf8');
    expect(guion).toContain("(to_jsonb(i) ->> 'codigo_correcto')::boolean");
    expect(guion).not.toMatch(/[^>' ]codigo_correcto/);
  });

  it('ninguna consulta convierte un fallo en un número con || echo', () => {
    const guion = readFileSync(path.join(raiz, '.github/scripts/revisar-bd.sh'), 'utf8');
    expect(guion).not.toMatch(/\|\| echo ['"]?0/);
  });

  it('staging no mira el respaldo, el espacio ni los intentos del código', () => {
    const guion = readFileSync(path.join(raiz, '.github/scripts/revisar-bd.sh'), 'utf8');
    const antesDeStaging = guion.slice(0, guion.indexOf('elif ! psql'));
    expect(antesDeStaging).toContain('ultimo_respaldo');
    expect(antesDeStaging).not.toContain('revisar_espacio "$bd"');
    const tras = guion.slice(guion.indexOf('[ "$entorno" = produccion ] || return 0'));
    expect(tras).toContain('revisar_espacio "$bd"');
    expect(tras).toContain('intentos_codigo');
    // Nada de `a && b` en su propia línea: con bash -e y `a` falso, terminaría el paso.
    expect(guion.split('\n').filter((l) => /^\s*\[.*\]\s*&&/.test(l))).toEqual([]);
  });
});

// docs/32 RV-220 y RV-221 (DEC-182, DEC-183): aviso al 70 % del espacio de fotos y de la base de datos
// con fn_espacio(), issue y push a jefatura; y aviso si el espacio de fotos no sale del bucket o su
// medida es vieja. Con bash -e, como en Actions, y un psql simulado.
describe('revisar_espacio (RV-220, RV-221)', () => {
  const raiz = path.resolve(import.meta.dirname, '..');
  /**
   * `espacio`: la línea que da la consulta de fn_espacio (origen, MB de fotos, tope, ¿alto?, MB de la
   * base, tope, ¿alta?, %, días de la medida). `push`: lo que responde el insert del aviso.
   */
  /**
   * docs/33 RV-301 (0044): detrás van el total del proyecto (MB, tope, ¿alto?, % del aviso), el
   * desglose (hidrantes, pg_cron, pg_net, resto) y si la purga de pg_cron tiene permiso. Una línea de
   * las nueve columnas de antes se completa con un total bajo.
   */
  const conTotal = (espacio: string) =>
    espacio.split(' ').length === 9 ? `${espacio} 120 500 f 80 50 5 1 64 ok 0` : espacio;
  const correr = (espacio: string, { push = '2', falla = '' } = {}) => {
    const guion = [
      'set -uo pipefail',
      `psql() {
        if [ -n "$FALLA" ] && [[ "$*" == *"$FALLA"* ]]; then echo 'ERROR: simulado' >&2; return 1; fi
        case "$*" in
          *"Espacio casi lleno"*) echo push >> "$ANOTADO"; echo "$PUSH" ;;
          *fn_espacio*) printf '%s\\n' "$ESPACIO" ;;
          *) echo 'consulta inesperada' >&2; return 1 ;;
        esac
      }`,
      'problemas=()',
      'source .github/scripts/revisar-bd.sh',
      'revisar_espacio postgresql://simulada',
      'printf "%s\\n" "${problemas[@]}"',
      'echo FIN',
    ].join('\n');
    const dir = mkdtempSync(path.join(tmpdir(), 'espacio-'));
    const anotado = path.join(dir, 'anotado');
    try {
      const r = spawnSync('bash', ['-e', '-c', guion], {
        cwd: raiz,
        encoding: 'utf8',
        env: { ...process.env, ESPACIO: conTotal(espacio), PUSH: push, FALLA: falla, ANOTADO: anotado },
      });
      const lineas = r.stdout.trim().split('\n');
      return {
        codigo: r.status,
        fin: lineas.at(-1) === 'FIN',
        problemas: lineas.slice(0, -1).filter(Boolean),
        pushes: existsSync(anotado) ? readFileSync(anotado, 'utf8').trim().split('\n').length : 0,
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('por debajo del 70 % y medido en el bucket: nada', () => {
    const r = correr('storage 100 800 f 50 400 f 70 0');
    expect(r).toEqual({ codigo: 0, fin: true, problemas: [], pushes: 0 });
  });

  it('las fotos al 70 % o más: problema con los MB y un aviso push', () => {
    const r = correr('storage 560 800 t 50 400 f 70 0');
    expect(r.codigo).toBe(0);
    expect(r.problemas).toEqual([expect.stringContaining('las fotos ocupan 560 MB de 800')]);
    expect(r.problemas[0]).toContain('aviso al 70 %');
    expect(r.pushes).toBe(1);
  });

  it('la base de datos al 70 % o más: problema y un aviso push; con las dos, un solo push', () => {
    const bd = correr('storage 100 800 f 290 400 t 70 0');
    expect(bd.problemas).toEqual([expect.stringContaining('la base de datos ocupa 290 MB de 400')]);
    expect(bd.pushes).toBe(1);
    const las2 = correr('storage 700 800 t 290 400 t 70 0');
    expect(las2.problemas).toHaveLength(2);
    expect(las2.pushes).toBe(1);
  });

  it('si ya se avisó en 20 h no es otro problema; si no hay administradores suscritos, sí', () => {
    expect(correr('storage 560 800 t 50 400 f 70 0', { push: 'ya' }).problemas).toHaveLength(1);
    const nadie = correr('storage 560 800 t 50 400 f 70 0', { push: '0' });
    expect(nadie.problemas).toContainEqual(expect.stringContaining('ningún administrador tiene los avisos activados'));
    const falla = correr('storage 560 800 t 50 400 f 70 0', { falla: 'Espacio casi lleno' });
    expect(falla.problemas).toContainEqual('no se ha podido avisar a jefatura de que el espacio está casi lleno');
    expect(falla.fin).toBe(true);
  });

  it('el espacio de fotos que no sale del bucket es un problema, sin push', () => {
    const r = correr('respaldo 100 800 f 50 400 f 70 2');
    expect(r.problemas).toEqual([expect.stringContaining('el espacio de fotos no se mide en el bucket (respaldo)')]);
    expect(r.pushes).toBe(0);
  });

  it('una medida vieja (más de 8 días) o sin fecha es otro problema', () => {
    expect(correr('respaldo 100 800 f 50 400 f 70 8').problemas).toHaveLength(1);
    const vieja = correr('respaldo 100 800 f 50 400 f 70 9');
    expect(vieja.problemas).toContainEqual(expect.stringContaining('la medida del espacio de fotos tiene 9 días'));
    const sinFecha = correr('sin_dato 0 800 f 50 400 f 70 -1');
    expect(sinFecha.problemas).toContainEqual(expect.stringContaining('no dice de cuándo es'));
  });

  it('si fn_espacio falla o da algo raro, es un problema y la vigilancia sigue', () => {
    const falla = correr('storage 100 800 f 50 400 f 70 0', { falla: 'fn_espacio' });
    expect(falla.problemas).toEqual([expect.stringContaining('no se puede medir el espacio')]);
    expect(falla.fin).toBe(true);
    for (const raro of ['', 'storage 100 800', 'storage 100 800 x 50 400 f 70 0']) {
      const r = correr(raro);
      expect(r.problemas, raro).toEqual([expect.stringContaining('no entiende')]);
      expect(r.fin, raro).toBe(true);
    }
  });

  it('toda la base de datos del proyecto al 80 % o más: problema con el desglose y un aviso push', () => {
    const r = correr('storage 100 800 f 50 400 f 70 0 410 500 t 80 50 300 20 40 ok 0');
    expect(r.problemas).toEqual([
      expect.stringContaining(
        'toda la base de datos del proyecto ocupa 410 MB de 500 (aviso al 80 %): hidrantes 50 MB, historial de pg_cron 300 MB',
      ),
    ]);
    expect(r.problemas[0]).not.toContain('grant delete');
    expect(r.pushes).toBe(1);
  });

  it('el historial de pg_cron que no se borra es un problema, con la causa si falta el permiso', () => {
    const viejo = correr('storage 100 800 f 50 400 f 70 0 120 500 f 80 50 5 1 64 ok 12');
    expect(viejo.problemas).toEqual([expect.stringContaining('el historial de pg_cron tiene 12 ejecuciones')]);
    expect(viejo.pushes).toBe(0);
    const sinPermiso = correr('storage 100 800 f 50 400 f 70 0 120 500 f 80 50 5 1 64 sin_permiso 12');
    expect(sinPermiso.problemas[0]).toContain('falta el grant delete on cron.job_run_details');
    expect(correr('storage 100 800 f 50 400 f 70 0 120 500 f 80 50 5 1 64 sin_permiso 0').problemas).toEqual([]);
    const ilegible = correr('storage 100 800 f 50 400 f 70 0 120 500 f 80 50 5 1 64 ok -1');
    expect(ilegible.problemas).toEqual([expect.stringContaining('no se puede leer el historial de pg_cron')]);
  });

  it('el tope de la base de datos lee el esquema (esquema_bytes), y sin 0044 el total como antes', () => {
    const guion = readFileSync(path.join(raiz, '.github/scripts/revisar-bd.sh'), 'utf8');
    expect(guion).toContain("coalesce(e ->> 'esquema_bytes', e ->> 'bd_bytes')::bigint >= (e ->> 'aviso')::numeric");
    expect(correr('storage 100 800 f 290 400 t 70 0').problemas[0]).toContain('en el esquema hidrantes');
    const raro = correr('storage 100 800 f 50 400 f 70 0 410 500 t 80 50 300 20 40 quizas 0');
    expect(raro.problemas).toEqual([expect.stringContaining('no entiende')]);
  });

  it('sustituye al aviso fijo de 400 MB', () => {
    const guion = readFileSync(path.join(raiz, '.github/scripts/revisar-bd.sh'), 'utf8');
    expect(guion).not.toContain('400 * 1024 * 1024');
    expect(guion).toContain('from hidrantes.fn_espacio() e');
  });
});

// docs/22 RV-89, DEC-128: ubuntu-latest pasa a Ubuntu 26 el 19 oct 2026.
describe('imagen de los trabajos de Actions (RV-89)', () => {
  const runsOn = archivos.flatMap((a) =>
    [...leer(a).matchAll(/^\s+runs-on: (.+)$/gm)].map((m) => ({ archivo: a, imagen: m[1]!.trim() })),
  );

  it('ningún runs-on es ubuntu-latest', () => {
    expect(runsOn.filter((r) => r.imagen.includes('ubuntu-latest'))).toEqual([]);
  });

  it('todos son ubuntu-24.04, salvo el canario de Ubuntu 26', () => {
    const otros = runsOn.filter((r) => r.imagen !== 'ubuntu-24.04');
    expect(otros).toEqual([{ archivo: 'canario-ubuntu.yml', imagen: 'ubuntu-26.04' }]);
    expect(runsOn.length).toBeGreaterThanOrEqual(22);
  });

  it('el canario usa ubuntu-26.04, llama a preparar con psql y abre su issue', () => {
    const texto = leer('canario-ubuntu.yml');
    expect(texto).toMatch(/^ {2}canario-ubuntu-26:\n {4}runs-on: ubuntu-26\.04$/m);
    expect(texto).toMatch(/uses: \.\/\.github\/actions\/preparar\n\s+with:\n\s+psql: 'true'/);
    expect(texto).toContain('psql --version');
    expect(texto).toContain('pg_dump --version');
    expect(texto).toContain('jq --version');
    expect(texto).toContain('npm run typecheck && npm test');
    expect(texto).toContain("cron: '13 5 * * 3'");
    expect(texto).toContain('Canario Ubuntu 26 en rojo');
  });

  it('el canario está en las listas de workflows programados, como semanal', () => {
    for (const a of ['mantener-activo.yml', 'vigilancia.yml']) {
      for (const l of listas(a)) expect(l).toContain('canario-ubuntu.yml');
    }
    expect(leer('vigilancia.yml')).toContain('respaldo.yml | purgar-fotos.yml | canario-ubuntu.yml) limite=8');
  });
});

// docs/22 RV-90, RV-93 y RV-94.
describe('mantenimiento de docs/22', () => {
  it('ci-calidad falla si los tests dejan archivos sueltos, justo después de npm test (RV-90)', () => {
    const ci = leer('ci.yml');
    const tras = ci.slice(ci.indexOf('      - run: npm test\n'));
    expect(tras).toMatch(/^ {6}- run: npm test\n(?: {6}#.*\n)* {6}- name: Los tests no dejan archivos sueltos\n/);
    expect(ci).toContain('git status --porcelain --untracked-files=all');
    const gitignore = readFileSync(path.resolve(import.meta.dirname, '../.gitignore'), 'utf8');
    expect(gitignore).toMatch(/^tareas-\*\.json$/m);
  });

  it('la vigilancia corre dos veces al día (RV-93)', () => {
    const crons = [...leer('vigilancia.yml').matchAll(/^\s+- cron: (.+)$/gm)].map((m) => m[1]!.trim());
    expect(crons).toEqual(["'41 7 * * *'", "'41 19 * * *'"]);
  });

  it('la purga anota el tamaño también en un ensayo (RV-94)', () => {
    const texto = leer('purgar-fotos.yml');
    const paso = texto.slice(texto.indexOf('- name: Anotar el espacio')).split(/\n\s{6}- name:/)[0]!;
    expect(paso).not.toMatch(/if:.*!inputs\.ensayo/);
    expect(paso).toContain('purgar-fotos.yml (ensayo)');
  });

  it('la primera pasada programada de la purga es ensayo y lee ultima_purga_fotos (RV-94)', () => {
    const texto = leer('purgar-fotos.yml');
    expect(texto).toContain("PROGRAMADA: ${{ github.event_name == 'schedule' && '--programada' || '' }}");
    expect(texto).toContain('npm run purgar-fotos -- $ENSAYO $PROGRAMADA');
    expect(texto).toContain("if: ${{ steps.purga.outputs.primera_vez == '1' }}");
    expect(texto).toContain('Primera purga de fotos: revisa el ensayo');
    const script = readFileSync(path.resolve(import.meta.dirname, 'purgar-fotos.ts'), 'utf8');
    expect(script).toContain("hayMarca(bd, 'ultima_purga_fotos')");
    // DEC-151: el ensayo de la primera programada también cuenta, y la siguiente ya borra.
    expect(script).toContain("hayMarca(bd, 'primera_purga_ensayada')");
    expect(script).toContain('if (primeraVez && bd) anotarEnsayoInicial(bd);');
  });
});

// DEC-153: sin GitHub App, el PR de versión sigue necesitando el empujón de DEC-079.
describe('release-please sin GitHub App (DEC-153)', () => {
  const texto = leer('release-please.yml');

  it('no usa ninguna GitHub App ni sus secretos', () => {
    expect(texto).not.toMatch(/create-github-app-token|RELEASE_APP_ID|RELEASE_APP_KEY|steps\.app/);
  });

  it('con un PR de versión, lanza la CI y deja el comando del empujón', () => {
    expect(texto).toContain('- if: steps.release.outputs.pr\n');
    expect(texto).toContain('gh workflow run ci.yml');
    expect(texto).toContain("git commit --allow-empty -m 'chore(release): lanzar la CI del PR de versión'");
  });
});

// docs/31 RV-135, DEC-096: un PR develop → main fusionado con squash deja en main cambios fuera de la
// historia de develop, y el siguiente PR a main choca. ci-calidad lo para en el PR a main.
// Cada caso crea un repositorio con una docena de llamadas a git: en Windows pasa de los 5 s.
describe('main dentro de la historia de la rama en los PR a main (RV-135)', { timeout: 30_000 }, () => {
  const guion = path.resolve(import.meta.dirname, '../.github/scripts/main-en-la-rama.sh').replaceAll('\\', '/');

  /** Un repositorio con develop y origin/main. `fusion` dice cómo llegó la release 1 a main. */
  function repo(fusion: 'merge' | 'squash' | 'squash-arreglado') {
    const dir = mkdtempSync(path.join(tmpdir(), 'main-en-la-rama-'));
    const git = (...a: string[]) =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], {
        cwd: dir,
        encoding: 'utf8',
      }).trim();
    const version = (v: string) => {
      writeFileSync(path.join(dir, 'version.txt'), v);
      git('add', 'version.txt');
      git('commit', '-q', '-m', `versión ${v}`);
    };
    git('init', '-q', '-b', 'develop');
    version('0');
    git('branch', 'main');
    version('1');
    git('switch', '-q', 'main');
    if (fusion === 'merge') git('merge', '-q', '--no-ff', 'develop', '-m', 'merge de develop');
    else {
      git('merge', '-q', '--squash', 'develop');
      git('commit', '-q', '-m', 'squash de develop');
    }
    git('update-ref', 'refs/remotes/origin/main', 'main');
    git('switch', '-q', 'develop');
    if (fusion === 'squash-arreglado') git('merge', '-q', '-s', 'ours', 'origin/main', '-m', 'main en develop');
    version('2');
    return { dir, cabeza: git('rev-parse', 'HEAD') };
  }

  const comprobar = (dir: string, cabeza: string) =>
    spawnSync('bash', ['-c', `set -euo pipefail; source "${guion}"; main_en_la_rama "${cabeza}"`], {
      cwd: dir,
      encoding: 'utf8',
    });

  function con(fusion: Parameters<typeof repo>[0], prueba: (dir: string, cabeza: string) => void) {
    const { dir, cabeza } = repo(fusion);
    try {
      prueba(dir, cabeza);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('pasa si la release anterior llegó a main con merge commit (aunque su punta no sea ancestro)', () => {
    con('merge', (dir, cabeza) => {
      const r = comprobar(dir, cabeza);
      expect(r.status, r.stdout + r.stderr).toBe(0);
    });
  });

  it('falla si llegó con squash, y dice cómo arreglarlo', () => {
    con('squash', (dir, cabeza) => {
      const r = comprobar(dir, cabeza);
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('::error::main tiene cambios fuera de la historia de esta rama');
      expect(r.stdout).toContain('git merge -s ours origin/main');
      // Y el motivo exacto: el commit y el archivo que main tiene y la rama no.
      expect(r.stdout).toContain('squash de develop');
      expect(r.stdout).toContain('version.txt');
    });
  });

  it('pasa otra vez después del merge -s ours de origin/main en develop', () => {
    con('squash-arreglado', (dir, cabeza) => {
      const r = comprobar(dir, cabeza);
      expect(r.status, r.stdout + r.stderr).toBe(0);
    });
  });

  it('sin cabeza, o con una que no está en el clon, falla con 2 en vez de dar por bueno', () => {
    con('merge', (dir) => {
      expect(comprobar(dir, '').status).toBe(2);
      const r = comprobar(dir, 'f'.repeat(40));
      expect(r.status).toBe(2);
      expect(r.stdout).toContain('No encuentro la cabeza del PR');
    });
  });

  it('ci-calidad lo comprueba solo en PR a main, con la cabeza del PR y no con HEAD', () => {
    const ci = leer('ci.yml');
    const calidad = ci.slice(ci.indexOf('\n  calidad:\n'), ci.indexOf('\n  sql:\n'));
    const paso = calidad.slice(calidad.indexOf('- name: main dentro de la historia de la rama')).split(/\n\s{6}- /)[0]!;
    expect(paso).toContain("if: github.event_name == 'pull_request' && github.base_ref == 'main'");
    expect(paso).toContain('CABEZA: ${{ github.event.pull_request.head.sha }}');
    expect(paso).toContain('main_en_la_rama "$CABEZA"');
    expect(calidad).toMatch(/fetch-depth: 0/);
  });
});

// docs/32 RV-209: respaldo y purga decían «gh secret set» de repositorio cuando faltaba un secreto, y
// seguirlas devolvía los secretos de producción al repositorio, al alcance de cualquier rama (DEC-172).
describe('las instrucciones de reparación no deshacen DEC-172 (docs/32 RV-209)', () => {
  const scripts = path.resolve(import.meta.dirname, '../.github/scripts');
  const textos: [string, string][] = [
    ...archivos.map((a): [string, string] => [a, leer(a)]),
    ...readdirSync(scripts).map((a): [string, string] => [a, readFileSync(path.join(scripts, a), 'utf8')]),
  ];

  it('ningún mensaje sugiere gh secret set sin --env', () => {
    const malas = textos.flatMap(([a, t]) =>
      t
        .split('\n')
        .filter((l) => /gh secret set\b/.test(l) && !/--env\b/.test(l))
        .map((l) => `${a}: ${l.trim()}`),
    );
    expect(malas).toEqual([]);
  });

  it('ningún mensaje manda los secretos «de repositorio»', () => {
    const malas = textos.flatMap(([a, t]) =>
      t
        .split('\n')
        .filter((l) => /\becho\b/.test(l) && /secretos? (\*\*)?de repositorio/i.test(l))
        .map((l) => `${a}: ${l.trim()}`),
    );
    expect(malas).toEqual([]);
  });

  it('respaldo y purga mandan a traspasar-secreto o a gh secret set --env prod-tareas', () => {
    for (const a of ['respaldo.yml', 'purgar-fotos.yml']) {
      expect(leer(a), a).toContain('npm run traspasar-secreto -- --secreto ');
      expect(leer(a), a).toMatch(/--hacia prod-tareas/);
      expect(leer(a), a).toMatch(/gh secret set \S+ --env prod-tareas/);
    }
  });

  it('purgar-fotos trata SUPABASE_URL_PROD como variable, no como secreto', () => {
    const purga = leer('purgar-fotos.yml');
    expect(purga).toContain('${{ vars.SUPABASE_URL_PROD }}');
    expect(purga).not.toMatch(/secrets\.SUPABASE_URL_PROD|secret set SUPABASE_URL_PROD/);
    expect(purga).toContain('gh variable set SUPABASE_URL_PROD');
    expect(purga).toContain('la variable SUPABASE_URL_PROD');
  });
});
