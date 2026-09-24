// Compatibilidad hacia atrás (TR-107, 04 §12): la versión publicada del frontend, contra la base de
// datos ya migrada con lo que trae esta rama. Es la ventana del despliegue: `deploy-staging.yml`
// migra primero y publica después, así que durante unos minutos los móviles de los voluntarios
// siguen ejecutando el frontend anterior contra el esquema nuevo. Si una migración rompe el
// contrato de una RPC, se ve aquí y no en el móvil de alguien.
//
//   npm run compatibilidad                    contra origin/develop (o la rama base del PR)
//   npm run compatibilidad -- --ref <rama>    contra otra referencia
//   npm run compatibilidad -- --forzar        aunque esta rama no toque migraciones
//
// Cómo: un `git worktree` de la referencia en `.anterior/`, su propio `vite build`, su propio
// `wrangler pages dev` y **sus propios** casos de integración (los de entonces, que hablan de las
// pantallas de entonces). Todo contra el Supabase local de ci-sql, nunca contra dev ni prod.

import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { abortar, argumentos, ejecutar, ejecutarScript, errorSeguro, log, RAIZ } from './lib/comun.ts';

const CARPETA = '.anterior';
const DESTINO = path.join(RAIZ, CARPETA);
const PUERTO = Number(process.env.PUERTO_COMPATIBILIDAD ?? 8788);
const ESPERA_MS = 120_000;

/** La rama que está publicada: en un PR, aquella contra la que se fusiona. */
export function referenciaPorDefecto(env: NodeJS.ProcessEnv): string {
  return `origin/${env.GITHUB_BASE_REF || 'develop'}`;
}

/**
 * Si esta rama no toca `supabase/migrations`, la base de datos es la misma que ya tiene delante el
 * frontend publicado y no hay nada que comprobar. `git diff --name-only` vacío significa eso.
 */
export function tocaMigraciones(salidaDeGitDiff: string): boolean {
  return salidaDeGitDiff
    .split('\n')
    .map((l) => l.trim())
    .some((l) => l.startsWith('supabase/migrations/') && l.endsWith('.sql'));
}

/**
 * Los casos de integración anteriores a RV-36 entran en el panel con una sesión de contraseña, que
 * desde 0022 ya no es jefatura (DEC-094). El frontend publicado entra con Google y sigue funcionando
 * con la base nueva; lo que no puede es su arnés de pruebas, porque el Supabase local no tiene
 * Google. Si la referencia no trae `e2e/integracion/sesion-google.ts`, se le copia el de ahora y
 * cada sesión con contraseña de sus casos se vuelve a firmar como de Google. En cuanto la referencia
 * publicada lo traiga, no hace nada.
 */
export function adaptarSesiones(texto: string): string {
  const patron =
    /const sesion = await \(\n(\s+await request\.post\(`[^`]*grant_type=password`[\s\S]*?\n\s*)\)\.json\(\);/g;
  if (!patron.test(texto)) return texto;
  patron.lastIndex = 0;
  const adaptado = texto.replace(
    patron,
    (_, peticion: string) => `const sesion = comoGoogle(await (\n${peticion}).json());`,
  );
  return adaptado.replace(
    "import { T } from '../../src/lib/textos.ts';",
    "import { T } from '../../src/lib/textos.ts';\nimport { comoGoogle } from './sesion-google.ts';",
  );
}

function adaptarArnesAnterior(): void {
  const carpeta = path.join(DESTINO, 'e2e', 'integracion');
  if (!existsSync(carpeta) || existsSync(path.join(carpeta, 'sesion-google.ts'))) return;
  copyFileSync(path.join(RAIZ, 'e2e', 'integracion', 'sesion-google.ts'), path.join(carpeta, 'sesion-google.ts'));
  for (const archivo of readdirSync(carpeta).filter((a) => a.endsWith('.spec.ts'))) {
    const ruta = path.join(carpeta, archivo);
    const texto = readFileSync(ruta, 'utf8');
    const adaptado = adaptarSesiones(texto);
    if (adaptado !== texto) {
      writeFileSync(ruta, adaptado);
      log.info(`${archivo}: la sesión de jefatura se firma como de Google (DEC-094)`);
    }
  }
}

function limpiarWorktree(): void {
  if (existsSync(DESTINO)) ejecutar('git', ['worktree', 'remove', '--force', CARPETA]);
  ejecutar('git', ['worktree', 'prune']);
  if (existsSync(DESTINO)) rmSync(DESTINO, { recursive: true, force: true });
}

function matar(proceso: ChildProcess): void {
  if (proceso.exitCode !== null || !proceso.pid) return;
  // En Windows hay que matar el árbol entero: npx cuelga de un cmd y wrangler de node.
  if (process.platform === 'win32') ejecutar('taskkill', ['/pid', String(proceso.pid), '/t', '/f']);
  else process.kill(-proceso.pid, 'SIGTERM');
}

async function esperarA(url: string): Promise<void> {
  const limite = Date.now() + ESPERA_MS;
  while (Date.now() < limite) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  abortar(`${url} no respondió en ${ESPERA_MS / 1000} s.`);
}

async function principal(): Promise<void> {
  const { banderas, valores } = argumentos();
  const ref = valores.get('ref') ?? referenciaPorDefecto(process.env);

  log.paso(`Compatibilidad hacia atrás: el frontend de ${ref} contra esta base de datos (TR-107)`);

  // La referencia puede no estar todavía en el clon superficial de CI (fetch-depth 1). `--depth 1`
  // solo si el clon YA es superficial: en uno completo lo volvería superficial, y a partir de ahí
  // `git pull` de esa rama falla con "refusing to merge unrelated histories" (me pasó al probarlo).
  const [remoto, rama] = ref.startsWith('origin/') ? ['origin', ref.slice('origin/'.length)] : ['', ''];
  if (remoto) {
    const superficial = ejecutar('git', ['rev-parse', '--is-shallow-repository']).salida === 'true';
    ejecutar('git', ['fetch', ...(superficial ? ['--depth', '1'] : []), remoto, rama]);
  }
  const existe = ejecutar('git', ['rev-parse', '--verify', `${ref}^{commit}`]);
  if (existe.codigo !== 0) abortar(`No encuentro ${ref}. Pasa --ref con una rama que exista.`);

  const cambios = ejecutar('git', ['diff', '--name-only', `${ref}`, 'HEAD', '--', 'supabase/migrations']);
  if (!banderas.has('forzar') && !tocaMigraciones(cambios.salida)) {
    log.ok('Esta rama no cambia las migraciones: el frontend publicado ve la misma base de datos.');
    return;
  }

  limpiarWorktree();
  const alta = ejecutar('git', ['worktree', 'add', '--detach', CARPETA, ref]);
  if (alta.codigo !== 0) abortar(`No se pudo preparar el worktree:\n${errorSeguro(alta.error)}`);
  log.ok(
    `${ref} desplegado en ${CARPETA}/ (${ejecutar('git', ['-C', CARPETA, 'rev-parse', '--short', 'HEAD']).salida})`,
  );

  let wrangler: ChildProcess | null = null;
  try {
    // El build de entonces, con el Supabase local de ahora: las variables las lee de .env.local.
    for (const archivo of ['.env.local', '.dev.vars']) {
      if (!existsSync(path.join(RAIZ, archivo))) abortar(`Falta ${archivo}: ejecuta npm run arranque -- --local.`);
      copyFileSync(path.join(RAIZ, archivo), path.join(DESTINO, archivo));
    }
    // `vite build` y no `npm run build`: el typecheck del código de entonces no aporta nada aquí, y
    // las dependencias se resuelven en el node_modules del repositorio, que está justo encima.
    const construido = ejecutar('npx', ['--no-install', 'vite', 'build'], { cwd: DESTINO });
    if (construido.codigo !== 0)
      abortar(`El frontend de ${ref} no compila:\n${errorSeguro(construido.error || construido.salida)}`);
    log.ok('frontend anterior construido');
    adaptarArnesAnterior();

    const orden = [
      'npx',
      '--no-install',
      'wrangler',
      'pages',
      'dev',
      'dist',
      '--port',
      String(PUERTO),
      '--ip',
      '127.0.0.1',
      '--compatibility-date=2026-09-01',
    ];
    // En Windows, `npx` es un .cmd: hay que pasar por el shell, y con la orden ya montada en una
    // sola cadena (con la lista, Node avisa de que no escapa los argumentos). Ninguno lleva espacios.
    wrangler =
      process.platform === 'win32'
        ? spawn(orden.join(' '), { cwd: DESTINO, shell: true, stdio: 'ignore' })
        : spawn(orden[0], orden.slice(1), { cwd: DESTINO, detached: true, stdio: 'ignore' });
    await esperarA(`http://127.0.0.1:${PUERTO}`);
    log.ok(`sus Pages Functions sirviendo en :${PUERTO}`);

    // Sus casos de integración, con su configuración: los de entonces hablan de las pantallas de
    // entonces. Si el esquema nuevo rompiera una RPC que aquel frontend usa, fallan aquí.
    // `--retries=1`, como en CI: un caso que se cae por una espera no puede pasar por un contrato
    // roto. Si de verdad lo está, falla también en el reintento.
    const pruebas = ejecutar(
      'npx',
      ['--no-install', 'playwright', 'test', '--config', `${CARPETA}/playwright.config.ts`, '--retries=1'],
      { env: { INTEGRACION: '1' }, heredar: true },
    );
    if (pruebas.codigo !== 0) {
      abortar(`El frontend de ${ref} NO funciona con esta base de datos: mira arriba qué caso falla (04 §12).`);
    }
    log.ok(`El frontend de ${ref} sigue funcionando con las migraciones de esta rama.`);
  } finally {
    if (wrangler) matar(wrangler);
    limpiarWorktree();
  }
}

if (import.meta.main) ejecutarScript(principal);
