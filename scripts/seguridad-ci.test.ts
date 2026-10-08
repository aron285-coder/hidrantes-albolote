import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
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
    expect(bloques.map((b) => b.split('\n')[0])).toEqual(['npm', 'github-actions']);
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
    expect(texto).not.toMatch(/head\.(sha|ref)|github\.head_ref/);
    expect(texto).toContain('node .github/scripts/automerge-permitido.mjs .github/automerge-permitidos.txt');
    // Solo fusiona si el script lo dice: ningún otro camino llega a gh pr merge.
    expect(texto.match(/gh pr merge/g)).toHaveLength(1);
    expect(texto).toMatch(
      /if: steps\.decidir\.outputs\.decision == 'fusionar'\n(?:.*\n){0,4}\s+run: gh pr merge --auto --squash/,
    );
  });
});

// docs/32 RV-204 (DEC-181): solo los parches de desarrollo de una lista de paquetes seguros se fusionan solos.
describe('lista de permitidos de Dependabot (RV-204)', () => {
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
    ...extra,
  });
  const decidir = (dependencias: unknown) => {
    const r = spawnSync(process.execPath, [script, lista], {
      env: { ...process.env, DEPENDENCIAS: JSON.stringify(dependencias), GITHUB_STEP_SUMMARY: '' },
      encoding: 'utf8',
    });
    return { codigo: r.status, salida: r.stdout.trim(), error: r.stderr };
  };

  it('la lista es la de la especificación', () => {
    expect(patrones).toEqual([
      'eslint*',
      '@eslint/*',
      'prettier',
      '@types/*',
      'typescript-eslint',
      'globals',
      '@playwright/test',
      '@axe-core/playwright',
      'vitest',
      '@vitest/*',
    ]);
  });

  it('un parche de vite no se fusiona solo: va en el bundle', () => {
    const r = decidir([parche('vite')]);
    expect(r.codigo).toBe(0);
    expect(r.salida).toBe('decision=esperar');
    expect(r.error).toContain('vite: no está en la lista de permitidos');
  });

  it('un parche de @types/node sí', () => {
    const r = decidir([parche('@types/node')]);
    expect(r.salida).toBe('decision=fusionar');
  });

  it('los paquetes que corren con los secretos de producción o van en el bundle esperan', () => {
    for (const p of ['workbox-window', 'vite-plugin-pwa', '@tailwindcss/vite', 'wrangler', 'tsx', 'openpgp']) {
      expect(decidir([parche(p)]).salida).toBe('decision=esperar');
    }
  });

  it('los comodines: eslint-plugin-x y @vitest/coverage-v8 sí; algo que solo contiene el nombre, no', () => {
    expect(decidir([parche('eslint-plugin-react-hooks'), parche('@vitest/coverage-v8')]).salida).toBe(
      'decision=fusionar',
    );
    expect(decidir([parche('mi-eslint')]).salida).toBe('decision=esperar');
    expect(decidir([parche('@typesx/node')]).salida).toBe('decision=esperar');
  });

  it('un grupo con uno solo fuera de la lista espera entero', () => {
    expect(decidir([parche('@types/node'), parche('vite')]).salida).toBe('decision=esperar');
  });

  it('de la lista, pero menor, o de producción: espera', () => {
    expect(decidir([parche('vitest', { updateType: 'version-update:semver-minor' })]).salida).toBe('decision=esperar');
    expect(decidir([parche('@types/node', { dependencyType: 'direct:production' })]).salida).toBe('decision=esperar');
  });

  it('sin dependencias, o con un JSON roto, no se fusiona', () => {
    expect(decidir([]).salida).toBe('decision=esperar');
    const roto = spawnSync(process.execPath, [script, lista], {
      env: { ...process.env, DEPENDENCIAS: '{no es json' },
      encoding: 'utf8',
    });
    expect(roto.status).toBe(2);
    expect(roto.stdout).not.toContain('fusionar');
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
      'npx wrangler pages deploy dist --project-name hidrantes-albolote-staging --branch develop',
    );
    expect(staging).not.toMatch(/--project-name\s+"?\$\{\{/);
  });

  it('los dos despliegues ponen ENTORNO en su proyecto antes de desplegar, y VITE_ENTORNO en el build', () => {
    for (const [a, proyecto, valor] of [
      ['deploy-staging.yml', 'hidrantes-albolote-staging', 'staging'],
      ['deploy-prod.yml', 'hidrantes-albolote', 'produccion'],
    ] as const) {
      const texto = leer(a);
      const poner = texto.indexOf(`poner_entorno ${proyecto} ${valor}\n`);
      expect(poner, a).toBeGreaterThan(-1);
      expect(poner, a).toBeLessThan(texto.indexOf('wrangler pages deploy'));
      expect(texto).toContain('source .github/scripts/entorno-pages.sh');
      const build = texto.slice(texto.indexOf('- run: npm run build'));
      expect(build.slice(0, build.indexOf('\n      - '))).toContain('VITE_ENTORNO: ${{ vars.VITE_ENTORNO }}');
    }
  });
});
