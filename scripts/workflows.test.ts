import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Sin parser de YAML en las dependencias: expresiones acotadas sobre los archivos, que bastan para
// lo que se comprueba aquí (DEC-085).
const carpeta = path.resolve(import.meta.dirname, '../.github/workflows');
const archivos = readdirSync(carpeta).filter((a) => a.endsWith('.yml'));
const leer = (a: string) => readFileSync(path.join(carpeta, a), 'utf8');

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
    for (const a of archivos) {
      for (const [i, l] of leer(a).split('\n').entries()) {
        if (/psql\b/.test(l) && /\s-v\s/.test(l) && /\s-c\s/.test(l) && /:'\w+'/.test(l)) malas.push(`${a}:${i + 1}`);
      }
    }
    expect(malas).toEqual([]);
  });

  it('guardar las tareas no se traga el error con || true', () => {
    const texto = leer('vigilancia.yml');
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
    const texto = leer('vigilancia.yml');
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

  it('deploy-staging.yml despliega el Worker tras Pages, si cambió workers/ o si aún no existe', () => {
    const texto = leer('deploy-staging.yml');
    const paso = texto.indexOf('- name: Desplegar el Worker de los avisos');
    expect(paso).toBeGreaterThan(texto.indexOf('wrangler pages deploy'));
    expect(texto.slice(paso)).toContain('npx wrangler deploy --config workers/avisos/wrangler.toml');
    expect(texto.slice(paso)).toContain('git diff --name-only HEAD~1 HEAD -- workers/');
    expect(texto).toMatch(/fetch-depth: 2/);
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
    expect(texto).toContain("interval '30 minutes'");
    expect(texto).not.toContain("interval '2 hours'");
  });

  it('avisos.yml ya no está en las listas de workflows programados', () => {
    for (const a of ['mantener-activo.yml', 'vigilancia.yml']) {
      for (const lista of listas(a)) expect(lista).not.toContain('avisos.yml');
    }
  });
});
