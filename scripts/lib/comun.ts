// Utilidades compartidas por los scripts de operación (arranque, migrar, revertir…).
// Sin dependencias: solo Node.

import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface, type Interface } from 'node:readline';
import { Writable } from 'node:stream';
import path from 'node:path';

export const RAIZ = path.resolve(import.meta.dirname, '..', '..');
const esWindows = process.platform === 'win32';

// ---------- salida ----------

export const log = {
  paso: (t: string) => console.log(`\n\x1b[36m▶ ${t}\x1b[0m`),
  ok: (t: string) => console.log(`  \x1b[32m✓\x1b[0m ${t}`),
  info: (t: string) => console.log(`  · ${t}`),
  aviso: (t: string) => console.log(`  \x1b[33m⚠ ${t}\x1b[0m`),
  error: (t: string) => console.error(`  \x1b[31m✗ ${t}\x1b[0m`),
};

export class ErrorDeScript extends Error {}

export function abortar(mensaje: string): never {
  throw new ErrorDeScript(mensaje);
}

/** Ejecuta `principal` y convierte los ErrorDeScript en un mensaje limpio y código 1. */
export function ejecutarScript(principal: () => Promise<void>): void {
  principal()
    .then(() => cerrarEntrada())
    .catch((e: unknown) => {
      cerrarEntrada();
      if (e instanceof ErrorDeScript) log.error(e.message);
      else console.error(e);
      process.exit(1);
    });
}

// ---------- procesos ----------

function citar(arg: string): string {
  if (!esWindows || /^[\w@%+=:,./\\-]+$/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

export interface Resultado {
  codigo: number;
  salida: string;
  error: string;
}

/**
 * Ejecuta un comando y devuelve su salida. En Windows los `.cmd` (npx, gh…) exigen shell,
 * así que los argumentos se citan aquí. Nunca pases secretos como argumentos: usa `entrada`
 * (stdin) o `env`, que no aparecen en la lista de procesos.
 */
export function ejecutar(
  comando: string,
  args: string[],
  opciones: { entrada?: string; env?: NodeJS.ProcessEnv; heredar?: boolean; cwd?: string } = {},
): Resultado {
  const spawnOpts: SpawnSyncOptions = {
    cwd: opciones.cwd ?? RAIZ,
    env: { ...process.env, ...opciones.env },
    input: opciones.entrada,
    encoding: 'utf8',
    shell: esWindows,
    stdio: opciones.heredar ? ['inherit', 'inherit', 'inherit'] : ['pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  };
  // En Windows se pasa una sola cadena ya citada: con shell, Node no cita los argumentos por separado.
  const r = esWindows
    ? spawnSync([comando, ...args].map(citar).join(' '), spawnOpts)
    : spawnSync(comando, args, spawnOpts);
  if (r.error) abortar(`No se pudo ejecutar ${comando}: ${errorSeguro(r.error.message)}`);
  return { codigo: r.status ?? 1, salida: String(r.stdout ?? '').trim(), error: String(r.stderr ?? '').trim() };
}

/** Como `ejecutar`, pero aborta si el comando falla. */
export function ejecutarOk(comando: string, args: string[], opciones: Parameters<typeof ejecutar>[2] = {}): string {
  const r = ejecutar(comando, args, opciones);
  if (r.codigo !== 0) abortar(`${comando} ${args[0] ?? ''} falló:\n${errorSeguro(r.error || r.salida)}`);
  return r.salida;
}

// ---------- repositorio (docs/32 RV-208) ----------

export interface Repositorio {
  /** El titular (usuario u organización) de GitHub. */
  propietario: string;
  /** El nombre del repositorio, sin titular. */
  nombre: string;
  /** `propietario/nombre`, como lo pide `gh --repo`. */
  completo: string;
}

/**
 * `propietario/nombre` a partir de la URL de un remoto de GitHub (https o ssh, con o sin `.git`).
 * Null si no es de GitHub: mejor parar que lanzar algo contra otro repositorio.
 */
export function repositorioDeRemoto(url: string): Repositorio | null {
  const m = /github\.com[:/]([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/.exec(url.trim());
  if (!m) return null;
  return { propietario: m[1]!, nombre: m[2]!, completo: `${m[1]}/${m[2]}` };
}

let repositorioCache: Repositorio | null = null;

/**
 * El repositorio de este checkout: la única fuente del titular y del nombre en `scripts/`. Se lee de
 * `git remote get-url origin` (en Actions, `actions/checkout` lo deja apuntando al repositorio), y
 * solo la primera vez que se pide: importar comun.ts no lanza git. Así, si el repositorio cambia de
 * titular (docs/04 §16), los scripts lo siguen sin tocar el código.
 */
export function repositorio(): Repositorio {
  if (repositorioCache) return repositorioCache;
  const r = ejecutar('git', ['remote', 'get-url', 'origin']);
  const encontrado = r.codigo === 0 ? repositorioDeRemoto(r.salida) : null;
  if (!encontrado)
    abortar('No sé de qué repositorio de GitHub es este checkout: `git remote get-url origin` no lo dice.');
  repositorioCache = encontrado;
  return encontrado;
}

// ---------- psql ----------

export function rutaPsql(): string {
  const r = spawnSync(esWindows ? 'where' : 'which', ['psql'], { encoding: 'utf8' });
  if (r.status === 0) return 'psql';
  for (const v of ['18', '17']) {
    const p = `C:\\Program Files\\PostgreSQL\\${v}\\bin\\psql.exe`;
    if (existsSync(p)) return p;
  }
  abortar('No encuentro psql. Instala los clientes de PostgreSQL 17 (docs/15 o el script de preparación del PC).');
}

/**
 * Convierte `postgresql://usuario:clave@host:puerto/bd` en variables PG* para que la contraseña
 * no aparezca en la línea de comandos.
 */
export function entornoPg(url: string): NodeJS.ProcessEnv {
  const u = new URL(url);
  const local = ['127.0.0.1', 'localhost'].includes(u.hostname);
  return {
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.replace(/^\//, '') || 'postgres',
    PGSSLMODE: u.searchParams.get('sslmode') ?? (local ? 'disable' : 'require'),
    PGAPPNAME: 'hidrantes-scripts',
  };
}

/**
 * Un error de psql sin los datos de la fila (docs/19 RV-53). En una violación de `check` o `not
 * null`, Postgres añade `DETAIL: Failing row contains (…)` con la fila entera, nombres de voluntarios
 * incluidos, y el repositorio es público: lo que se imprime en Actions lo lee cualquiera. Quita las
 * líneas DETAIL, CONTEXT y QUERY (y lo que cuelga de ellas) y cualquier "Failing row contains (…)";
 * deja el mensaje principal y el SQLSTATE si lo hay.
 */
export function errorSeguro(texto: string): string {
  const fuera = /^(?:psql:[^:]*:\d+:\s*)?(DETAIL|CONTEXT|QUERY|DETALLE|CONTEXTO):/;
  const lineas: string[] = [];
  let quitando = false;
  for (const linea of texto.split(/\r?\n/)) {
    if (fuera.test(linea.trim())) {
      quitando = true;
      continue;
    }
    // Lo que continúa una línea quitada va sangrado.
    if (quitando && /^\s+\S/.test(linea)) continue;
    quitando = false;
    lineas.push(linea.replace(/Failing row contains \([\s\S]*?\)\.?/g, 'Failing row contains (…)'));
  }
  return lineas.join('\n').trim();
}

/**
 * Ejecuta SQL con psql leyendo de stdin, con ON_ERROR_STOP. En Actions (`CI`), siempre con
 * VERBOSITY=terse: sin DETAIL ni CONTEXT, que pueden llevar datos de la fila (RV-53).
 */
export function argsPsql(opciones: { tuplas?: boolean; terse?: boolean } = {}): string[] {
  const args = ['-X', '-q', '-v', 'ON_ERROR_STOP=1'];
  if (process.env.CI || opciones.terse) args.push('-v', 'VERBOSITY=terse');
  args.push('-f', '-');
  if (opciones.tuplas) args.push('-A', '-t');
  return args;
}

export function psql(url: string, sql: string, opciones: { tuplas?: boolean; terse?: boolean } = {}): Resultado {
  return ejecutar(rutaPsql(), argsPsql(opciones), { entrada: sql, env: entornoPg(url) });
}

export function psqlOk(url: string, sql: string, opciones: { tuplas?: boolean; terse?: boolean } = {}): string {
  const r = psql(url, sql, opciones);
  if (r.codigo !== 0) abortar(`psql falló:\n${errorSeguro(r.error || r.salida)}`);
  return r.salida;
}

// ---------- entornos (docs/31 RV-134) ----------

/**
 * Los únicos entornos de los scripts que tocan una base de datos o un despliegue. `produccion` se
 * admite como otro nombre de `prod`: así lo escribían anonimizar y revertir, y con ese nombre
 * restaurar.ts no encontraba el ref y **no comprobaba el proyecto** (docs/31 RV-134).
 */
export const ENTORNOS = ['local', 'staging', 'prod'] as const;
export type Entorno = (typeof ENTORNOS)[number];
const ALIAS: Record<string, Entorno> = { produccion: 'prod', producción: 'prod' };

/** Refs de Supabase por entorno (docs/entornos.md). No son secretos: identifican el proyecto. */
export const REFS: Readonly<Record<Exclude<Entorno, 'local'>, string>> = {
  staging: 'jowapbzawsebfpksnlqx',
  prod: 'cbgqirjqyltadpydpeyr',
};

/** El ref viaja en el usuario del pooler (`hidrantes_migrador.«ref»`) o en el host de la directa. */
export function refDeUrl(url: string): string | null {
  return (
    /:\/\/[^:/@]+\.([a-z0-9]{20})[:@]/.exec(url)?.[1] ?? /@db\.([a-z0-9]{20})\.supabase\.co/.exec(url)?.[1] ?? null
  );
}

/**
 * `--entorno` validado: exactamente uno de `admitidos` (por defecto local, staging y prod), con
 * `produccion` como alias de `prod`. Cualquier otra cosa aborta antes de tocar nada.
 */
export function leerEntorno(crudo: string | undefined, admitidos: readonly Entorno[] = ENTORNOS): Entorno {
  const lista = admitidos.join(', ');
  if (crudo === undefined || crudo.trim() === '') abortar(`Indica --entorno (${lista}).`);
  const valor = crudo.trim().toLowerCase();
  const entorno = (ALIAS[valor] ?? valor) as Entorno;
  if (!admitidos.includes(entorno)) abortar(`Entorno desconocido: ${crudo} (${lista}; produccion vale por prod).`);
  return entorno;
}

/**
 * Por qué esa cadena no es del entorno pedido, o null si lo es. En staging y prod, el ref del
 * proyecto tiene que ser el suyo; en local, la base tiene que estar en esta máquina. Restaurar
 * producción sobre staging, o al revés, sería peor que el problema.
 */
export function motivoCadenaAjena(entorno: Entorno, url: string): string | null {
  if (entorno === 'local') {
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      return 'La cadena de conexión no es una URL de PostgreSQL.';
    }
    return ['127.0.0.1', 'localhost', '[::1]'].includes(host)
      ? null
      : `--entorno local, pero la cadena apunta a ${host}, que no es esta máquina.`;
  }
  const ref = refDeUrl(url);
  return ref === REFS[entorno]
    ? null
    : `Esa cadena apunta al proyecto ${ref ?? 'desconocido'}, y --entorno ${entorno} es ${REFS[entorno]}.`;
}

/** Como `motivoCadenaAjena`, pero aborta. */
export function comprobarCadena(entorno: Entorno, url: string): void {
  const motivo = motivoCadenaAjena(entorno, url);
  if (motivo) abortar(motivo);
}

// ---------- entrada interactiva ----------

// Una sola interfaz de lectura para todo el proceso: crear una por pregunta deja escuchas de
// teclado acumuladas en stdin y cada tecla llega repetida ("s" se leía "ss").
// Las líneas se encolan: si llegan varias de golpe (pegadas o por tubería) no se pierde ninguna.
let lector: Interface | null = null;
let silenciar = false;
const lineas: string[] = [];
const esperando: ((linea: string) => void)[] = [];
const salidaSilenciable = new Writable({
  write(trozo, _codificacion, listo) {
    if (!silenciar) process.stdout.write(trozo);
    listo();
  },
});

function asegurarLector(): void {
  if (lector) return;
  lector = createInterface({
    input: process.stdin,
    output: salidaSilenciable,
    terminal: Boolean(process.stdin.isTTY),
  });
  lector.on('line', (linea) => {
    const siguiente = esperando.shift();
    if (siguiente) siguiente(linea);
    else lineas.push(linea);
  });
}

export function cerrarEntrada(): void {
  lector?.close();
  lector = null;
}

export async function preguntar(texto: string, { oculto = false } = {}): Promise<string> {
  asegurarLector();
  process.stdout.write(`  ${texto}: `);
  silenciar = oculto;
  const linea = lineas.length ? lineas.shift()! : await new Promise<string>((ok) => esperando.push(ok));
  silenciar = false;
  if (oculto) process.stdout.write('\n');
  return linea.trim();
}

/** Acepta s, si, sí, y en inglés y o yes, en mayúsculas o minúsculas. */
export function esAfirmativo(respuesta: string): boolean {
  return /^(s|si|sí|y|yes)$/i.test(respuesta.trim());
}

export async function confirmar(texto: string): Promise<boolean> {
  return esAfirmativo(await preguntar(`${texto} [s/N]`));
}

// ---------- argumentos ----------

export function argumentos(): { banderas: Set<string>; valores: Map<string, string> } {
  const banderas = new Set<string>();
  const valores = new Map<string, string>();
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const actual = a[i];
    if (!actual.startsWith('--')) continue;
    const [clave, valor] = actual.slice(2).split('=', 2);
    if (valor !== undefined) valores.set(clave, valor);
    else if (a[i + 1] && !a[i + 1].startsWith('--')) valores.set(clave, a[++i]);
    else banderas.add(clave);
  }
  return { banderas, valores };
}
