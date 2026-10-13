import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// docs/31 §2 (RV-130 a RV-132): cómo se protege producción en los workflows. Sin parser de YAML,
// como scripts/workflows.test.ts (DEC-085): expresiones acotadas sobre los archivos.
const raiz = path.resolve(import.meta.dirname, '..');
const carpeta = path.join(raiz, '.github/workflows');
const archivos = readdirSync(carpeta).filter((a) => a.endsWith('.yml'));
const leer = (a: string) => readFileSync(path.join(carpeta, a), 'utf8');
const acciones = readdirSync(path.join(raiz, '.github/actions')).map((d) => `.github/actions/${d}/action.yml`);
const todos: [string, string][] = [
  ...archivos.map((a): [string, string] => [`.github/workflows/${a}`, leer(a)]),
  ...acciones.map((a): [string, string] => [a, readFileSync(path.join(raiz, a), 'utf8')]),
];

describe('dependencias y actions (RV-132)', () => {
  /** Los `uses:` de fuera del repositorio que no van fijados por un SHA de 40 caracteres con su etiqueta. */
  const sinSha = (texto: string) =>
    [...texto.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/gm)]
      .filter((m) => !m[1]!.startsWith('./'))
      .filter((m) => !/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(m[1]!) || !/^\s+#\s*v?\d+\.\d+\.\d+\s*$/.test(m[2]!))
      .map((m) => m[0]!.trim());

  it('la comprobación falla con un uses: de terceros sin SHA', () => {
    expect(sinSha('      - uses: treosh/lighthouse-ci-action@v12\n')).toHaveLength(1);
    expect(sinSha('        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\n')).toHaveLength(1);
    expect(sinSha('      - uses: x/y@3d3c42e5aac5ba805825da76410c181273ba9 # v1.0.0\n')).toHaveLength(1);
    expect(sinSha('      - uses: x/y@3d3c42e5aac5ba805825da76410c181273ba90b1 # v1.0.0\n')).toEqual([]);
    expect(sinSha('      - uses: ./.github/actions/preparar\n')).toEqual([]);
  });

  it('todas las actions de fuera del repositorio van fijadas por SHA, con la etiqueta en un comentario', () => {
    const malas = todos.flatMap(([a, t]) => sinSha(t).map((l) => `${a}: ${l}`));
    expect(malas).toEqual([]);
    expect(todos.some(([, t]) => /uses: actions\/checkout@[0-9a-f]{40}/.test(t))).toBe(true);
  });

  it('setup-node está en la versión 7, fijada por SHA', () => {
    const preparar = readFileSync(path.join(raiz, '.github/actions/preparar/action.yml'), 'utf8');
    expect(preparar).toMatch(/uses: actions\/setup-node@[0-9a-f]{40} # v7\.\d+\.\d+$/m);
  });

  it('Dependabot espera 7 días antes de proponer una versión, en npm y en actions', () => {
    const dependabot = readFileSync(path.join(raiz, '.github/dependabot.yml'), 'utf8');
    const bloques = dependabot.split(/\n\s{2}- package-ecosystem: /).slice(1);
    expect(bloques.map((b) => b.split('\n')[0])).toEqual(['npm', 'npm', 'github-actions']);
    for (const b of bloques) expect(b).toMatch(/\n\s{4}cooldown:\n\s{6}default-days: 7\n/);
  });

  it('Dependabot agrupa aparte los parches de desarrollo, que son lo único que se fusiona solo', () => {
    const dependabot = readFileSync(path.join(raiz, '.github/dependabot.yml'), 'utf8');
    const grupos = dependabot.slice(dependabot.indexOf('    groups:'));
    expect(grupos.indexOf('parches-desarrollo:')).toBeGreaterThan(-1);
    expect(grupos.indexOf('parches-desarrollo:')).toBeLessThan(grupos.indexOf('resto:'));
    expect(grupos).toMatch(/parches-desarrollo:\n\s+dependency-type: development\n\s+update-types: \[patch\]/);
  });

  it('automerge mira el autor del PR, no quien lo lanza, y decide con la lista de la rama base', () => {
    const texto = leer('automerge.yml');
    expect(texto).not.toContain('github.actor');
    expect(texto).toContain("github.event.pull_request.user.login == 'dependabot[bot]'");
    expect(texto).toContain('updated-dependencies-json');
    expect(texto).toContain('ref: ${{ github.event.pull_request.base.sha }}');
    // El workflow y sus actions, de la base: un PR que sube fetch-metadata no se ejecuta a sí mismo.
    expect(texto).toMatch(/^on: pull_request_target$/m);
    // Ningún checkout del código del PR (con pull_request_target, eso sí sería peligroso).
    expect(texto.match(/uses: actions\/checkout@/g)).toHaveLength(1);
    expect(texto).not.toMatch(/head\.ref|github\.head_ref/);
    // docs/35 RV-410: la cabeza del PR solo para leer su lockfile como datos, con la API de contenidos.
    const conCabeza = texto.split(/\n(?= {6}- )/).filter((p) => /head\.sha/.test(p));
    expect(conCabeza).toHaveLength(1);
    expect(conCabeza[0]).toContain('- name: Lockfile del PR');
    expect(conCabeza[0]).toContain(
      `gh api -H 'Accept: application/vnd.github.raw' "repos/$REPO/contents/package-lock.json?ref=$CABEZA"`,
    );
    expect(conCabeza[0]).not.toMatch(/uses:|npm|node |git /);
    expect(texto).toMatch(/sparse-checkout: \|\n(?:\s+\S+\n)*\s+package-lock\.json\n/);
    expect(texto).toContain('node .github/scripts/automerge-permitido.mjs .github/automerge-permitidos.txt');
    expect(texto).toContain('LOCK_BASE: package-lock.json');
    expect(texto).toContain('LOCK_PR: ${{ runner.temp }}/package-lock.pr.json');
    expect(texto).toContain('gh api --paginate "repos/$REPO/pulls/$NUMERO/files" --jq \'.[].filename\'');
    expect(texto).toContain('ARCHIVOS="$(cat "$RUNNER_TEMP/archivos.txt")"');
    // Solo fusiona si el script lo dice: ningún otro camino llega a gh pr merge --auto.
    expect(texto.match(/gh pr merge --auto/g)).toHaveLength(1);
    expect(texto).toMatch(
      /if: steps\.decidir\.outputs\.decision == 'fusionar'\n(?:.*\n){0,4}\s+run: gh pr merge --auto --squash/,
    );
    // Y si no, quita la que dejara una ejecución anterior (un empujón nuevo de Dependabot).
    const quitar = texto.slice(texto.indexOf('- name: Quitar la fusión automática si ya no vale'));
    expect(quitar).toContain("if: always() && steps.decidir.outputs.decision != 'fusionar'");
    expect(quitar).toContain('gh pr merge --disable-auto "$PR"');
    expect(quitar).not.toContain('|| true');
  });
});

// docs/32 RV-204 (DEC-181): solo los parches de desarrollo de una lista de paquetes seguros se fusionan solos.
// docs/35 RV-410 (DEC-198): nombres exactos, y el lockfile del PR sin nada más que esas dependencias.
// Cada caso lanza Node: con margen de tiempo.
describe('lista de permitidos de Dependabot (RV-204, RV-410)', { timeout: 30_000 }, () => {
  const lista = path.join(raiz, '.github/automerge-permitidos.txt');
  const script = path.join(raiz, '.github/scripts/automerge-permitido.mjs');
  const patrones = readFileSync(lista, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);
  const parche = (nombre: string, extra: object = {}) => ({
    dependencyName: nombre,
    dependencyType: 'direct:development',
    updateType: 'version-update:semver-patch',
    newVersion: '1.0.1',
    ...extra,
  });

  // Lockfiles de ejemplo (docs/35 RV-410): la base y el PR, con lo que cada caso cambia.
  type Entrada = Record<string, unknown>;
  /** Una entrada del lockfile, con el tarball del registro de npm y su integridad. */
  const entrada = (nombre: string, version: string, extra: Entrada = {}): Entrada => ({
    version,
    resolved: `https://registry.npmjs.org/${nombre}/-/${nombre.split('/').pop()}-${version}.tgz`,
    integrity: `sha512-${nombre}-${version}`,
    dev: true,
    ...extra,
  });
  const LOCK_BASE = {
    name: 'p',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: 'p',
        devDependencies: { '@types/node': '^1.0.0', '@types/react': '^1.0.0', vitest: '^1.0.0', vite: '^1.0.0' },
      },
      'node_modules/@types/node': entrada('@types/node', '1.0.0', { dependencies: { 'undici-types': '~1.0.0' } }),
      'node_modules/@types/react': entrada('@types/react', '1.0.0'),
      'node_modules/undici-types': entrada('undici-types', '1.0.0'),
      'node_modules/vitest': entrada('vitest', '1.0.0'),
      'node_modules/vite': entrada('vite', '1.0.0'),
      'node_modules/vite/node_modules/@types/node': entrada('@types/node', '1.0.0'),
    },
  };
  /** La raíz del PR: el rango de @types/node a ^1.0.1 y, con `extra`, otros cambios. */
  const raizPr = (extra: Record<string, string> = {}) => ({
    name: 'p',
    devDependencies: {
      '@types/node': '^1.0.1',
      '@types/react': '^1.0.0',
      vitest: '^1.0.0',
      vite: '^1.0.0',
      ...extra,
    },
  });
  /** El lockfile de un PR que sube @types/node a 1.0.1, con `cambios` encima. */
  const lockPr = (cambios: Record<string, Entrada | null> = {}) => {
    const packages: Record<string, Entrada> = {
      ...structuredClone(LOCK_BASE.packages),
      '': raizPr(),
      'node_modules/@types/node': entrada('@types/node', '1.0.1', { dependencies: { 'undici-types': '~1.0.0' } }),
    };
    for (const [ruta, e] of Object.entries(cambios)) {
      if (e === null) delete packages[ruta];
      else packages[ruta] = e;
    }
    return { ...LOCK_BASE, packages };
  };
  const SOLO_MANIFIESTOS = 'package.json\npackage-lock.json';

  const decidir = (dependencias: unknown, lockDelPr: unknown = lockPr(), archivos = SOLO_MANIFIESTOS) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'automerge-'));
    try {
      writeFileSync(path.join(dir, 'base.json'), JSON.stringify(LOCK_BASE));
      writeFileSync(path.join(dir, 'pr.json'), typeof lockDelPr === 'string' ? lockDelPr : JSON.stringify(lockDelPr));
      const r = spawnSync(process.execPath, [script, lista], {
        env: {
          ...process.env,
          DEPENDENCIAS: JSON.stringify(dependencias),
          LOCK_BASE: path.join(dir, 'base.json'),
          LOCK_PR: path.join(dir, 'pr.json'),
          ARCHIVOS: archivos,
          GITHUB_STEP_SUMMARY: '',
        },
        encoding: 'utf8',
      });
      return { codigo: r.status, salida: r.stdout.trim(), error: r.stderr };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('la lista es la de la especificación: nombres exactos, sin comodines', () => {
    expect(patrones).toEqual([
      'eslint',
      '@eslint/js',
      'eslint-plugin-react-hooks',
      'eslint-plugin-react-refresh',
      'prettier',
      '@types/geojson',
      '@types/leaflet',
      '@types/node',
      '@types/react',
      '@types/react-dom',
      'globals',
      '@axe-core/playwright',
    ]);
    expect(patrones.filter((p) => /[*?]/.test(p))).toEqual([]);
  });

  // Un paquete que fija la versión exacta de otro suyo cambia esa entrada en cada parche: con el
  // lockfile estricto, siempre esperaría. No se lista (vitest, @playwright/test, typescript-eslint).
  it('ningún paquete de la lista fija la versión exacta de otro en el lockfile', () => {
    const lock = JSON.parse(readFileSync(path.join(raiz, 'package-lock.json'), 'utf8'));
    const fijan = patrones.filter((p) =>
      Object.values(lock.packages[`node_modules/${p}`]?.dependencies ?? {}).some((v) =>
        /^\d+\.\d+\.\d+$/.test(String(v)),
      ),
    );
    expect(fijan).toEqual([]);
  });

  it('cada nombre de la lista es una dependencia de desarrollo de package.json', () => {
    const pkg = JSON.parse(readFileSync(path.join(raiz, 'package.json'), 'utf8'));
    expect(patrones.filter((p) => !(p in pkg.devDependencies))).toEqual([]);
  });

  it('un parche de vite no se fusiona solo: va en el bundle', () => {
    const r = decidir([parche('vite')]);
    expect(r.codigo).toBe(0);
    expect(r.salida).toBe('decision=esperar');
    expect(r.error).toContain('vite: no está en la lista de permitidos');
  });

  it('el caso bueno: un parche de @types/node que solo cambia esa entrada y su rango, sí', () => {
    const r = decidir([parche('@types/node')]);
    expect(r.salida, r.error).toBe('decision=fusionar');
  });

  it('los paquetes que corren con secretos o van en el bundle esperan', () => {
    for (const p of ['workbox-window', 'vite-plugin-pwa', '@tailwindcss/vite', 'wrangler', 'tsx', 'openpgp']) {
      expect(decidir([parche(p)]).salida).toBe('decision=esperar');
    }
  });

  it('sin comodines: un nombre parecido a uno de la lista espera', () => {
    for (const p of ['eslint-plugin-x', '@vitest/coverage-v8', '@types/otro', 'mi-eslint', '@typesx/node']) {
      expect(decidir([parche(p)]).salida, p).toBe('decision=esperar');
    }
  });

  it('una lista con un comodín no decide: sale con 2', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'automerge-lista-'));
    try {
      writeFileSync(path.join(dir, 'lista.txt'), '@types/*\n');
      writeFileSync(path.join(dir, 'l.json'), JSON.stringify(LOCK_BASE));
      const r = spawnSync(process.execPath, [script, path.join(dir, 'lista.txt')], {
        env: {
          ...process.env,
          DEPENDENCIAS: JSON.stringify([parche('@types/node')]),
          LOCK_BASE: path.join(dir, 'l.json'),
          LOCK_PR: path.join(dir, 'l.json'),
          ARCHIVOS: SOLO_MANIFIESTOS,
        },
        encoding: 'utf8',
      });
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('nombres exactos');
      expect(r.stdout).not.toContain('fusionar');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('un grupo con uno solo fuera de la lista espera entero', () => {
    expect(decidir([parche('@types/node'), parche('vite')]).salida).toBe('decision=esperar');
  });

  it('de la lista, pero menor, o de producción: espera', () => {
    expect(decidir([parche('vitest', { updateType: 'version-update:semver-minor' })]).salida).toBe('decision=esperar');
    expect(decidir([parche('@types/node', { dependencyType: 'direct:production' })]).salida).toBe('decision=esperar');
  });

  it('el lockfile añade un paquete: espera', () => {
    const r = decidir([parche('@types/node')], lockPr({ 'node_modules/nuevo': entrada('nuevo', '0.0.1') }));
    expect(r.salida).toBe('decision=esperar');
    expect(r.error).toContain('node_modules/nuevo: entrada nueva en el lockfile');
  });

  it('el lockfile cambia una dependencia transitiva: espera', () => {
    const r = decidir(
      [parche('@types/node')],
      lockPr({ 'node_modules/undici-types': entrada('undici-types', '1.0.9') }),
    );
    expect(r.salida).toBe('decision=esperar');
    expect(r.error).toContain('node_modules/undici-types: cambia y no es una dependencia del PR');
  });

  it('el lockfile trae un script de instalación, nuevo o en la dependencia del PR: espera', () => {
    const nuevo = decidir(
      [parche('@types/node')],
      lockPr({ 'node_modules/con-script': entrada('con-script', '1.0.0', { hasInstallScript: true }) }),
    );
    expect(nuevo.salida).toBe('decision=esperar');
    expect(nuevo.error).toContain('node_modules/con-script: trae un script de instalación');
    const mismo = decidir(
      [parche('@types/node')],
      lockPr({
        'node_modules/@types/node': entrada('@types/node', '1.0.1', {
          dependencies: { 'undici-types': '~1.0.0' },
          hasInstallScript: true,
        }),
      }),
    );
    expect(mismo.salida).toBe('decision=esperar');
    expect(mismo.error).toContain('node_modules/@types/node: cambia y trae un script de instalación');
  });

  it('la dependencia del PR en otra versión, con otras dependencias, o la raíz con más cambios: espera', () => {
    const otraVersion = decidir([parche('@types/node', { newVersion: '1.0.2' })]);
    expect(otraVersion.error).toContain('queda en 1.0.1 y Dependabot dice 1.0.2');
    const otrasDependencias = decidir(
      [parche('@types/node')],
      lockPr({ 'node_modules/@types/node': entrada('@types/node', '1.0.1', { dependencies: { otra: '^1.0.0' } }) }),
    );
    expect(otrasDependencias.error).toContain('cambia algo más que la versión');
    const raiz = decidir([parche('@types/node')], lockPr({ '': raizPr({ vite: '^2.0.0' }) }));
    expect(raiz.error).toContain('(raíz): cambia algo más');
    const quitada = decidir([parche('@types/node')], lockPr({ 'node_modules/vite': null }));
    expect(quitada.error).toContain('node_modules/vite: desaparece del lockfile');
    const fuera = decidir([parche('@types/node')], { ...lockPr(), lockfileVersion: 2 });
    expect(fuera.error).toContain('el lockfile no es de la versión 3');
    expect(fuera.error).toContain('el lockfile cambia fuera de `packages`');
    for (const r of [otraVersion, otrasDependencias, raiz, quitada, fuera]) expect(r.salida).toBe('decision=esperar');
  });

  it('el tarball de fuera del registro de npm, sin integridad, o un rango raro en la raíz: espera', () => {
    const git = decidir(
      [parche('@types/node')],
      lockPr({
        'node_modules/@types/node': {
          ...entrada('@types/node', '1.0.1', { dependencies: { 'undici-types': '~1.0.0' } }),
          resolved: 'git+https://ejemplo.invalid/x.git#abc',
        },
      }),
    );
    expect(git.error).toContain('el tarball no sale del registro de npm');
    const sinIntegridad = decidir(
      [parche('@types/node')],
      lockPr({
        'node_modules/@types/node': {
          ...entrada('@types/node', '1.0.1', { dependencies: { 'undici-types': '~1.0.0' } }),
          integrity: undefined,
        },
      }),
    );
    expect(sinIntegridad.error).toContain('sin integridad sha512');
    const rango = decidir(
      [parche('@types/node')],
      lockPr({ '': raizPr({ '@types/node': 'https://ejemplo.invalid/x.tgz' }) }),
    );
    expect(rango.error).toContain('el rango de @types/node pasa a');
    for (const r of [git, sinIntegridad, rango]) expect(r.salida).toBe('decision=esperar');
  });

  it('si el lockfile no sube la dependencia del PR, espera', () => {
    const r = decidir([parche('@types/node')], structuredClone(LOCK_BASE));
    expect(r.salida).toBe('decision=esperar');
    expect(r.error).toContain('@types/node: el lockfile no lo sube a 1.0.1');
  });

  it('una copia anidada de la dependencia del PR puede subir a la misma versión, no a otra', () => {
    const anidada = (version: string) =>
      lockPr({ 'node_modules/vite/node_modules/@types/node': entrada('@types/node', version) });
    expect(decidir([parche('@types/node')], anidada('1.0.1')).salida).toBe('decision=fusionar');
    const otra = decidir([parche('@types/node')], anidada('1.0.3'));
    expect(otra.salida).toBe('decision=esperar');
    expect(otra.error).toContain('node_modules/vite/node_modules/@types/node: queda en 1.0.3');
  });

  it('un grupo de dos: fusiona si sube las dos; si solo sube una, espera', () => {
    const dos = [parche('@types/node'), parche('@types/react')];
    const ambas = lockPr({
      '': raizPr({ '@types/react': '^1.0.1' }),
      'node_modules/@types/react': entrada('@types/react', '1.0.1'),
    });
    expect(decidir(dos, ambas).salida).toBe('decision=fusionar');
    const una = decidir(dos);
    expect(una.salida).toBe('decision=esperar');
    expect(una.error).toContain('@types/react: el lockfile no lo sube a 1.0.1');
  });

  it('un alias (otro paquete con el nombre de uno de la lista): espera', () => {
    const r = decidir(
      [parche('@types/node')],
      lockPr({
        'node_modules/@types/node': entrada('@types/node', '1.0.1', {
          name: 'otro-paquete',
          dependencies: { 'undici-types': '~1.0.0' },
        }),
      }),
    );
    expect(r.salida).toBe('decision=esperar');
  });

  it('un PR que toca algo más que package.json y package-lock.json: espera', () => {
    const r = decidir([parche('@types/node')], lockPr(), `${SOLO_MANIFIESTOS}\n.github/workflows/ci.yml`);
    expect(r.salida).toBe('decision=esperar');
    expect(r.error).toContain('.github/workflows/ci.yml: el PR toca algo más');
    expect(decidir([parche('@types/node')], lockPr(), '').salida).toBe('decision=esperar');
  });

  it('sin dependencias, con un JSON roto o sin lockfiles, no se fusiona', () => {
    expect(decidir([]).salida).toBe('decision=esperar');
    const roto = spawnSync(process.execPath, [script, lista], {
      env: { ...process.env, DEPENDENCIAS: '{no es json', LOCK_BASE: 'x', LOCK_PR: 'x', ARCHIVOS: SOLO_MANIFIESTOS },
      encoding: 'utf8',
    });
    expect(roto.status).toBe(2);
    expect(roto.stdout).not.toContain('fusionar');
    const sinLock = spawnSync(process.execPath, [script, lista], {
      env: {
        ...process.env,
        DEPENDENCIAS: JSON.stringify([parche('@types/node')]),
        LOCK_BASE: '',
        LOCK_PR: '',
        ARCHIVOS: SOLO_MANIFIESTOS,
      },
      encoding: 'utf8',
    });
    expect(sinLock.status).toBe(2);
    expect(decidir([parche('@types/node')], 'no es json').codigo).toBe(2);
    expect(decidir([parche('@types/node')], { packages: null }).salida).toBe('decision=esperar');
  });

  it('dependabot.yml agrupa en parches-desarrollo los mismos patrones que la lista', () => {
    const dependabot = readFileSync(path.join(raiz, '.github/dependabot.yml'), 'utf8');
    const grupo = dependabot.slice(dependabot.indexOf('      parches-desarrollo:'), dependabot.indexOf('      resto:'));
    const enGrupo = [...grupo.matchAll(/^\s+- '([^']+)'$/gm)].map((m) => m[1]);
    expect(enGrupo).toEqual(patrones);
  });
});

/** Los trabajos de un workflow: nombre, environment (o '') y su texto. */
export function trabajos(texto: string): { nombre: string; environment: string; texto: string }[] {
  const desde = texto.search(/^jobs:\n/m);
  if (desde === -1) return [];
  const partes = texto
    .slice(desde)
    .split(/^(?= {2}[\w-]+:\s*$)/m)
    .slice(1);
  return partes.map((p) => {
    const nombre = /^ {2}([\w-]+):/.exec(p)![1]!;
    const env = /^ {4}environment:[ \t]*(.*)$/m.exec(p);
    let environment = env?.[1]?.trim() ?? '';
    if (env && environment === '') environment = /^ {6}name:\s*(.+)$/m.exec(p.slice(env.index))?.[1]?.trim() ?? '';
    return { nombre, environment, texto: p };
  });
}

/** Los secretos de producción que usa un trabajo, por nombre o con un índice calculado (secrets[…]). */
const secretosProd = (texto: string) => [
  ...[...texto.matchAll(/secrets\.(\w+_PROD)\b/g)].map((m) => m[1]!),
  // Con un índice calculado no se sabe cuál es: puede ser uno de producción.
  ...[...texto.matchAll(/secrets\[[^\]]+\]/g)].map((m) => m[0]),
];

describe('secretos de producción solo en prod-tareas o production (RV-131)', () => {
  it('la comprobación ve un _PROD en un trabajo sin environment, o en staging', () => {
    const malo =
      'jobs:\n  a:\n    runs-on: x\n    steps:\n      - env:\n          B: ${{ secrets.SUPABASE_DB_URL_PROD }}\n';
    const [t] = trabajos(malo);
    expect(t).toMatchObject({ nombre: 'a', environment: '' });
    expect(secretosProd(t!.texto)).toEqual(['SUPABASE_DB_URL_PROD']);
    const conNombre = 'jobs:\n  b:\n    environment:\n      name: production\n      url: x\n    steps: []\n';
    expect(trabajos(conNombre)[0]!.environment).toBe('production');
  });

  it('ningún secrets.*_PROD fuera de un trabajo con environment prod-tareas o production', () => {
    // traspaso.yml lee el secreto que se le pide de donde esté: solo lo lanza el propietario (DEC-172).
    const malos = archivos
      .filter((a) => a !== 'traspaso.yml')
      .flatMap((a) =>
        trabajos(leer(a))
          .filter((t) => secretosProd(t.texto).length > 0)
          .filter((t) => !/^(prod-tareas|production)$/.test(t.environment) && !t.environment.includes("'prod-tareas'"))
          .map((t) => `${a}:${t.nombre} (${t.environment || 'sin environment'})`),
      );
    expect(malos).toEqual([]);
  });

  it('las tareas de producción declaran prod-tareas', () => {
    const env = (a: string, j: string) => trabajos(leer(a)).find((t) => t.nombre === j)?.environment;
    expect(env('respaldo.yml', 'respaldo')).toBe('prod-tareas');
    expect(env('purgar-fotos.yml', 'purgar')).toBe('prod-tareas');
    expect(env('vigilancia.yml', 'mirar')).toBe('prod-tareas');
    expect(env('comprobar-produccion.yml', 'comprobar')).toBe('prod-tareas');
    expect(env('avisos.yml', 'enviar')).toBe("${{ matrix.entorno == 'PROD' && 'prod-tareas' || 'staging' }}");
    expect(env('deploy-prod.yml', 'desplegar')).toBe('production');
  });

  it('respaldo y purga ya no dicen que van sin environment', () => {
    for (const a of ['respaldo.yml', 'purgar-fotos.yml']) {
      expect(leer(a)).not.toContain('Sin `environment: production`');
      expect(leer(a)).toContain('prod-tareas');
    }
  });
});

describe('staging no nombra el proyecto de producción (RV-130)', () => {
  /** Las menciones del proyecto de Pages de producción: hidrantes-albolote sin -staging detrás. */
  const nombraProduccion = (texto: string) =>
    texto
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .filter((l) => /(^|[^\w.-])hidrantes-albolote(?![\w-])(?!\.pages\.dev)/.test(l));

  it('la comprobación ve el proyecto de producción y no confunde el de staging ni las URL', () => {
    expect(
      nombraProduccion('        run: npx wrangler pages deploy dist --project-name hidrantes-albolote --branch x'),
    ).toHaveLength(1);
    expect(nombraProduccion('        run: poner_entorno hidrantes-albolote produccion')).toHaveLength(1);
    expect(
      nombraProduccion('        run: npx wrangler pages deploy dist --project-name hidrantes-albolote-staging'),
    ).toEqual([]);
    expect(nombraProduccion('      url: https://hidrantes-albolote.pages.dev')).toEqual([]);
  });

  it('ningún trabajo del environment staging nombra el proyecto de producción, ni lo toma de una variable', () => {
    const malos = archivos.flatMap((a) =>
      trabajos(leer(a))
        .filter((t) => t.environment === 'staging')
        .flatMap((t) => nombraProduccion(t.texto).map((l) => `${a}:${t.nombre}: ${l.trim()}`)),
    );
    expect(malos).toEqual([]);
    const staging = leer('deploy-staging.yml');
    expect(staging).toContain(
      '.github/despliegue/node_modules/.bin/wrangler pages deploy dist --project-name hidrantes-albolote-staging --branch develop',
    );
    expect(staging).not.toMatch(/--project-name\s+"?\$\{\{/);
  });

  // docs/35 RV-410: el build va en «construir», sin environment: VITE_ENTORNO es fijo en cada flujo, y
  // las variables públicas, las del repositorio de ese entorno.
  it('los dos despliegues ponen ENTORNO en su proyecto antes de desplegar, y VITE_ENTORNO en el build', () => {
    for (const [a, proyecto, valor, sufijo] of [
      ['deploy-staging.yml', 'hidrantes-albolote-staging', 'staging', 'STAGING'],
      ['deploy-prod.yml', 'hidrantes-albolote', 'produccion', 'PROD'],
    ] as const) {
      const texto = leer(a);
      const poner = texto.indexOf(`poner_entorno ${proyecto} ${valor}\n`);
      expect(poner, a).toBeGreaterThan(-1);
      expect(poner, a).toBeLessThan(texto.indexOf('wrangler pages deploy'));
      expect(texto).toContain('source .github/scripts/entorno-pages.sh');
      const build = texto.slice(texto.indexOf('- run: npm run build'));
      const paso = build.slice(0, build.indexOf('\n      - '));
      expect(paso).toContain(`VITE_ENTORNO: ${valor}\n`);
      expect(paso).toContain(`VITE_SUPABASE_URL: \${{ vars.SUPABASE_URL_${sufijo} }}`);
      expect(paso).toContain(`VITE_SUPABASE_ANON_KEY: \${{ vars.SUPABASE_ANON_KEY_${sufijo} }}`);
      expect(paso).toContain(`VITE_VAPID_PUBLIC_KEY: \${{ vars.VITE_VAPID_PUBLIC_KEY_${sufijo} }}`);
      // Ninguna variable del otro entorno.
      expect(paso).not.toMatch(sufijo === 'PROD' ? /_STAGING\b/ : /_PROD\b/);
    }
  });
});
