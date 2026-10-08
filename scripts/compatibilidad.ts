// Compatibilidad hacia atrás (TR-107, 04 §12): la versión publicada del frontend, contra la base de
// datos ya migrada con lo que trae esta rama. Es la ventana del despliegue: `deploy-staging.yml`
// migra primero y publica después, así que durante unos minutos los móviles de los voluntarios
// siguen ejecutando el frontend anterior contra el esquema nuevo. Si una migración rompe el
// contrato de una RPC, se ve aquí y no en el móvil de alguien.
//
//   npm run compatibilidad                    contra origin/develop (o la rama base del PR); en un PR a
//                                             main, contra el commit que sirve producción (RV-206)
//   npm run compatibilidad -- --ref <rama>    contra otra referencia
//   npm run compatibilidad -- --forzar        aunque esta rama no toque migraciones
//
// Cómo: un `git worktree` de la referencia en `.anterior/`, su propio `vite build`, su propio
// `wrangler pages dev` y **sus propios** casos de integración (los de entonces, que hablan de las
// pantallas de entonces). Todo contra el Supabase local de ci-sql, nunca contra dev ni prod.

import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { abortar, argumentos, ejecutar, ejecutarScript, errorSeguro, log, RAIZ, type Resultado } from './lib/comun.ts';
import { commitDeHtml } from './paridad.ts';

const CARPETA = '.anterior';
const DESTINO = path.join(RAIZ, CARPETA);
const PUERTO = Number(process.env.PUERTO_COMPATIBILIDAD ?? 8788);
const ESPERA_MS = 120_000;

export const URL_PRODUCCION = 'https://hidrantes-albolote.pages.dev/';

/** La rama que está publicada: en un PR, aquella contra la que se fusiona. */
export function referenciaPorDefecto(env: NodeJS.ProcessEnv): string {
  return `origin/${env.GITHUB_BASE_REF || 'develop'}`;
}

export const AVISO_SIN_PRODUCCION =
  'No se ha podido leer el commit que sirve producción (<meta name="commit">): se compara con origin/main, que puede ir por delante de lo que tienen los móviles.';

/**
 * docs/32 RV-206: en un PR a main, el frontend que de verdad tienen los móviles es el que sirve
 * producción, que puede ir por detrás de `main` (un deploy rechazado o sin aprobar). Se compara con
 * el commit de su <meta name="commit">; si no se puede leer, con origin/main y un aviso.
 */
export function elegirReferencia(
  env: NodeJS.ProcessEnv,
  lectura: LecturaProduccion | null,
): { ref: string; aviso: string | null } {
  if (env.GITHUB_BASE_REF !== 'main') return { ref: referenciaPorDefecto(env), aviso: null };
  if (lectura?.commit && /^[0-9a-f]{40}$/.test(lectura.commit)) return { ref: lectura.commit, aviso: null };
  const motivo = lectura?.commit
    ? `dice ${lectura.commit}, que no es un commit completo`
    : (lectura?.motivo ?? 'no se ha consultado');
  return { ref: 'origin/main', aviso: `${AVISO_SIN_PRODUCCION} Motivo: ${motivo}.` };
}

export interface LecturaProduccion {
  commit: string | null;
  /** Por qué no hay commit (null si lo hay). */
  motivo: string | null;
}

/** El commit que sirve producción, o por qué no se ha podido leer. Solo un GET a la portada. */
export async function leerCommitProduccion(
  pedir: (url: string) => Promise<{ ok: boolean; status?: number; text: () => Promise<string> }> = (url) =>
    fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'cache-control': 'no-cache' } }),
): Promise<LecturaProduccion> {
  try {
    const r = await pedir(URL_PRODUCCION);
    if (!r.ok) return { commit: null, motivo: `${URL_PRODUCCION} responde ${r.status ?? 'con error'}` };
    const commit = commitDeHtml(await r.text());
    return commit ? { commit, motivo: null } : { commit: null, motivo: 'la portada no trae <meta name="commit">' };
  } catch (e) {
    return {
      commit: null,
      motivo: `${URL_PRODUCCION} no responde (${errorSeguro(e instanceof Error ? e.message : String(e))})`,
    };
  }
}

type Ej = (comando: string, args: string[]) => Resultado;

/**
 * Trae la referencia al clon (en CI, superficial) y devuelve la que se usa. El commit de producción
 * que no se puede traer pasa a origin/main con aviso (RV-206), salvo si se pidió con --ref: entonces
 * se para. Un fallo al traer una rama se avisa; si además no está en el clon, se para después.
 */
export function traerReferencia(ej: Ej, ref: string, explicita: boolean, aviso: (t: string) => void): string {
  // `--depth 1` solo si el clon YA es superficial: en uno completo lo volvería superficial, y a partir
  // de ahí `git pull` de esa rama falla con "refusing to merge unrelated histories".
  const superficial = ej('git', ['rev-parse', '--is-shallow-repository']).salida === 'true';
  const traer = (que: string) => ej('git', ['fetch', ...(superficial ? ['--depth', '1'] : []), 'origin', que]);
  const rama = (r: string) => {
    const f = traer(r.slice('origin/'.length));
    if (f.codigo !== 0)
      aviso(`No se ha podido traer ${r}: ${errorSeguro(f.error || f.salida)}. Se usa la copia local.`);
    return r;
  };
  if (ref.startsWith('origin/')) return rama(ref);
  if (!/^[0-9a-f]{40}$/.test(ref)) return ref;
  const f = traer(ref);
  if (f.codigo === 0) return ref;
  if (explicita) abortar(`No se ha podido traer ${ref}: ${errorSeguro(f.error || f.salida)}`);
  aviso(
    `No se ha podido traer ${ref.slice(0, 7)}, el commit de producción (${errorSeguro(f.error || f.salida)}). ${AVISO_SIN_PRODUCCION}`,
  );
  return rama('origin/main');
}

/** ¿Cambian las migraciones de `ref` a HEAD? Si git falla, se para: un fallo no es «no cambian». */
export function cambianMigraciones(ej: Ej, ref: string): boolean {
  const r = ej('git', ['diff', '--name-only', ref, 'HEAD', '--', 'supabase/migrations']);
  if (r.codigo !== 0) abortar(`git diff contra ${ref} ha fallado: ${errorSeguro(r.error || r.salida)}`);
  return tocaMigraciones(r.salida);
}

function avisar(texto: string): void {
  log.aviso(texto);
  // En Actions, también como anotación: que se vea en el resumen del PR, no solo en el log.
  if (process.env.GITHUB_ACTIONS) console.log(`::warning::${texto}`);
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

/**
 * Columnas que `v_puntos_activos` ganó después de la referencia (05 §4). El caso de la Fase 5 de
 * entonces comprueba que la respuesta no trae autores con una lista cerrada de columnas, así que
 * cualquier columna nueva, aunque no sea personal, lo haría fallar sin que el frontend anterior
 * tenga ningún problema: ese frontend no la lee. Solo se añaden a su lista las que 05 §4 ya
 * documenta; un autor seguiría fallando.
 */
export const COLUMNAS_NUEVAS_PUNTOS = ['foto_sitio_path'] as const; // 0035, DEC-146

export function adaptarColumnasPermitidas(texto: string): string {
  if (!texto.includes('const PERMITIDAS = new Set([')) return texto;
  const faltan = COLUMNAS_NUEVAS_PUNTOS.filter((c) => !texto.includes(`'${c}'`));
  if (!faltan.length || !texto.includes("  'foto_path',\n")) return texto;
  return texto.replace("  'foto_path',\n", `  'foto_path',\n${faltan.map((c) => `  '${c}',\n`).join('')}`);
}

function adaptarColumnasAnteriores(): void {
  const ruta = path.join(DESTINO, 'e2e', 'integracion', 'fase5.spec.ts');
  if (!existsSync(ruta)) return;
  const texto = readFileSync(ruta, 'utf8');
  const adaptado = adaptarColumnasPermitidas(texto);
  if (adaptado !== texto) {
    writeFileSync(ruta, adaptado);
    log.info(`fase5.spec.ts: admite las columnas nuevas de v_puntos_activos (${COLUMNAS_NUEVAS_PUNTOS.join(', ')})`);
  }
}

function adaptarArnesAnterior(): void {
  adaptarColumnasAnteriores();
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
  let ref = valores.get('ref');
  if (!ref) {
    const elegida = elegirReferencia(
      process.env,
      process.env.GITHUB_BASE_REF === 'main' ? await leerCommitProduccion() : null,
    );
    ref = elegida.ref;
    if (elegida.aviso) avisar(elegida.aviso);
  }

  // La referencia puede no estar todavía en el clon superficial de CI (fetch-depth 1).
  ref = traerReferencia(ejecutar, ref, valores.has('ref'), avisar);

  log.paso(`Compatibilidad hacia atrás: el frontend de ${ref} contra esta base de datos (TR-107)`);
  const existe = ejecutar('git', ['rev-parse', '--verify', `${ref}^{commit}`]);
  if (existe.codigo !== 0) abortar(`No encuentro ${ref}. Pasa --ref con una rama que exista.`);

  if (!banderas.has('forzar') && !cambianMigraciones(ejecutar, ref)) {
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
