import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

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

  it('vigilancia.yml comprueba y rehabilita la misma lista', () => {
    const texto = leer('vigilancia.yml');
    const ls = listas('vigilancia.yml');
    expect(ls.length).toBe(2);
    for (const l of ls) expect(l).toEqual(programados);
    expect(texto).toContain('runs?event=schedule&per_page=1');
    expect(texto).toContain('/actions/workflows/$w/enable');
    expect(texto).toMatch(/^\s{2}actions: write/m);
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
    expect(texto).not.toMatch(/^\s*environment:/m);
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
    expect(paso('Rehabilitar los workflows programados')).toMatch(/^\s+continue-on-error: true$/m);
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

  it('los navegadores salen de la caché por la versión de @playwright/test', () => {
    const accion = readFileSync(path.join(raiz, '.github/actions/navegadores/action.yml'), 'utf8');
    expect(accion).toContain("packages['node_modules/@playwright/test'].version");
    expect(accion).toContain('path: ~/.cache/ms-playwright');
    expect(accion).toContain('npx playwright install-deps chromium firefox');
    expect(accion).toContain('npx playwright install --with-deps chromium firefox');
  });

  it('playwright.config.ts no tiene el puerto 4173 fuera del valor por defecto de PW_PUERTO', () => {
    const config = readFileSync(path.join(raiz, 'playwright.config.ts'), 'utf8');
    expect(config).toContain('Number(process.env.PW_PUERTO ?? 4173)');
    expect(config.replace('process.env.PW_PUERTO ?? 4173', '')).not.toContain('4173');
    const vite = readFileSync(path.join(raiz, 'vite.config.ts'), 'utf8');
    expect(vite).toContain('port: Number(process.env.VITE_PUERTO ?? 5173)');
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
  const correr = (entorno: string, tareas: string) => {
    const guion = [
      'set -uo pipefail',
      `psql() {
        case "$*" in
          *tareas-programadas.sql*) printf '%s' "$TAREAS" ;;
          *guardar-tareas.sql*) echo "guardado $*" >> "$ANOTADO" ;;
          *ultimo_respaldo*) echo 3 ;;
          *notificaciones*) echo 0 ;;
          *pg_database_size*) echo 1000 ;;
          *intentos_codigo*) echo '0 0' ;;
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
        env: { ...process.env, TAREAS: tareas, ANOTADO: path.join(dir, 'anotado'), RUNNER_TEMP: dir },
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

  it('staging no mira el respaldo, el tamaño ni los intentos del código', () => {
    const guion = readFileSync(path.join(raiz, '.github/scripts/revisar-bd.sh'), 'utf8');
    const antesDeStaging = guion.slice(0, guion.indexOf('elif ! psql'));
    expect(antesDeStaging).toContain('ultimo_respaldo');
    const tras = guion.slice(guion.indexOf('[ "$entorno" = produccion ] || return 0'));
    expect(tras).toContain('pg_database_size');
    expect(tras).toContain('intentos_codigo');
    // Nada de `a && b` en su propia línea: con bash -e y `a` falso, terminaría el paso.
    expect(guion.split('\n').filter((l) => /^\s*\[.*\]\s*&&/.test(l))).toEqual([]);
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
    expect(script).toContain("fn_config('ultima_purga_fotos'");
  });
});

// docs/23 RV-97, DEC-140: el PR de versión con el token de una GitHub App, y reserva sin ella.
describe('release-please con la GitHub App (RV-97)', () => {
  const texto = leer('release-please.yml');

  it('saca un token de la App con create-github-app-token, solo si existe RELEASE_APP_ID', () => {
    expect(texto).toContain('uses: actions/create-github-app-token@v2');
    expect(texto).toMatch(/- id: app\n\s+if: vars\.RELEASE_APP_ID != ''/);
    expect(texto).toContain('app-id: ${{ vars.RELEASE_APP_ID }}');
    expect(texto).toContain('private-key: ${{ secrets.RELEASE_APP_KEY }}');
  });

  it('release-please usa ese token y, sin App, GITHUB_TOKEN', () => {
    expect(texto).toContain('token: ${{ steps.app.outputs.token || secrets.GITHUB_TOKEN }}');
  });

  it('el empujón y el workflow_dispatch de la CI solo salen sin la App', () => {
    expect(texto).toContain("- if: steps.release.outputs.pr && vars.RELEASE_APP_ID == ''");
    expect(texto).toContain('gh workflow run ci.yml');
  });

  it('ninguna clave en claro', () => {
    expect(texto).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY/);
    expect(texto).not.toMatch(/app-id: ['"]?\d+/);
  });
});
