// Las RPC que se llaman con service_role, sin JWT de usuario (docs/33 RV-305, seguimiento de D1). Solo lectura.
//
//   npx tsx scripts/rpc-de-servicio.ts               lista las RPC encontradas
//   npx tsx scripts/rpc-de-servicio.ts --comprobar   falla si supabase/tests/40 no lista las mismas
//
// D1 (#561) pasó porque ninguna prueba miraba que service_role pudiera ejecutar lo que llaman las
// Functions. supabase/tests/40_permisos_service_role.test.sql lo comprueba con pgTAP para cada RPC de
// esta lista, y scripts/rpc-de-servicio.test.ts (vitest, en CI) falla si las dos listas no coinciden.
//
// Qué lee, en functions/**, scripts/** y workers/** (*.ts, sin los *.test.ts):
// - `rpc(env, 'fn_x', …)` / `rpc<T>(e, 'fn_x', …)`: el ayudante de functions/_lib/comun.ts y el de
//   scripts/despachar.ts (AYUDANTES). El nombre es el segundo argumento. Si el cuarto es `{ jwt }` o
//   `{ jwt: x }`, va con la identidad de quien llama y no cuenta.
// - `.rpc('fn_x'`: un cliente con método rpc.
// - `/rest/v1/rpc/fn_x` escrito en una URL (fetch directo, como scripts/purgar-fotos.ts).
// Lo que no sabe leer no lo deja pasar: un `rpc(…)` sin nombre literal, o un `/rest/v1/rpc/${…}` fuera
// de AYUDANTES, salen como problemas y el test falla. No mira llamadas por psql (van como postgres, no
// como service_role) ni los workflows de .github/ (curl con la clave anónima).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { abortar, argumentos, ejecutarScript, log } from './lib/comun.ts';

export const CARPETAS = ['functions', 'scripts', 'workers'];
export const PGTAP = 'supabase/tests/40_permisos_service_role.test.sql';

/**
 * Archivos que llaman RPC sin la clave de servicio a propósito, con el motivo. Sus llamadas no cuentan.
 */
export const AJENOS: Record<string, string> = {
  'scripts/intrusion.ts': 'prueba de intrusión: llama con la clave anónima para comprobar que se rechaza',
  'scripts/rpc-de-servicio.ts': 'este mismo script: sus ejemplos no son llamadas',
};

/**
 * Archivos que definen un ayudante con el nombre de la RPC en una variable (`/rest/v1/rpc/${nombre}`), y
 * se llama `rpc(…, 'fn_x', …)` para que el escáner lea sus llamadas. Un `/rest/v1/rpc/${` en cualquier
 * otro archivo es un ayudante nuevo que el escáner no sabría leer: falla hasta que se declare aquí.
 */
export const AYUDANTES = ['functions/_lib/comun.ts', 'scripts/despachar.ts'];

/** `rpc(` o `rpc<T>(`, que no sea `x.rpc(`, `otrorpc(` ni la definición `function rpc(`. */
const LLAMADA = /(?<![\w$.])(?<!function\s+)rpc\s*(?=[<(])/g;
const LITERAL = /^['"`]([a-z_][a-z0-9_]*)['"`]$/;
const METODO = /\.rpc\s*\(\s*['"`]([a-z_][a-z0-9_]*)['"`]/g;
const URL_RPC = /\/rest\/v1\/rpc\/([a-z_][a-z0-9_]*)\b/g;
const URL_VARIABLE = /\/rest\/v1\/rpc\/\$\{/;
/** El cuarto argumento de una llamada con la identidad de quien llama: `{ jwt }` o `{ jwt: x }`. */
const CON_JWT = /^\{\s*jwt(?:\s*:\s*[\w$.!]+)?\s*,?\s*\}$/;

/**
 * Los argumentos de primer nivel de la llamada cuyo paréntesis abre en `abre`. Salta comillas y
 * comentarios para no contar sus paréntesis ni sus comas. Sin cierre, lanza: nunca adivina.
 */
export function argumentosDeLaLlamada(texto: string, abre: number): string[] {
  const partes: string[] = [];
  let nivel = 0;
  let desde = abre + 1;
  for (let i = abre; i < texto.length; i++) {
    const c = texto[i]!;
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < texto.length && texto[i] !== c; i++) if (texto[i] === '\\') i++;
      continue;
    }
    if (c === '/' && texto[i + 1] === '/') {
      i = texto.indexOf('\n', i);
      if (i < 0) break;
      continue;
    }
    if (c === '/' && texto[i + 1] === '*') {
      i = texto.indexOf('*/', i + 2) + 1;
      if (i <= 0) break;
      continue;
    }
    if (c === '(' || c === '{' || c === '[') nivel++;
    else if (c === ')' || c === '}' || c === ']') {
      if (--nivel === 0) {
        partes.push(texto.slice(desde, i));
        return partes.map((p) => p.trim()).filter((p, n, todas) => p !== '' || n < todas.length - 1);
      }
    } else if (c === ',' && nivel === 1) {
      partes.push(texto.slice(desde, i));
      desde = i + 1;
    }
  }
  throw new Error(`llamada sin cerrar en la posición ${abre}`);
}

/** Salta un tipo genérico `<…>` (anidado o no) que empieza en `i`; devuelve dónde sigue. */
function saltarGenerico(texto: string, i: number): number {
  if (texto[i] !== '<') return i;
  let nivel = 0;
  for (; i < texto.length; i++) {
    if (texto[i] === '<') nivel++;
    else if (texto[i] === '>' && texto[i - 1] !== '=' && --nivel === 0) return i + 1;
  }
  return i;
}

export interface Escaneo {
  nombres: string[];
  /** Llamadas que el escáner no sabe leer: hacen fallar el test en vez de pasar sin verse. */
  problemas: string[];
}

/** Las RPC de servicio de un archivo, sin repetir y en orden. */
export function rpcEnTexto(texto: string, archivo = '(texto)'): Escaneo {
  const nombres = new Set<string>();
  const problemas: string[] = [];
  for (const m of texto.matchAll(LLAMADA)) {
    const abre = saltarGenerico(texto, m.index + m[0].length);
    const linea = texto.slice(0, m.index).split('\n').length;
    if (texto[abre] !== '(') continue;
    let args: string[];
    try {
      args = argumentosDeLaLlamada(texto, abre);
    } catch {
      problemas.push(`${archivo}:${linea}: llamada a rpc sin cerrar`);
      continue;
    }
    const nombre = LITERAL.exec(args[1] ?? '')?.[1];
    if (!nombre) {
      problemas.push(`${archivo}:${linea}: rpc con el nombre de la función fuera de un literal`);
      continue;
    }
    if (CON_JWT.test(args[3] ?? '')) continue;
    nombres.add(nombre);
  }
  for (const m of texto.matchAll(METODO)) nombres.add(m[1]!);
  for (const m of texto.matchAll(URL_RPC)) nombres.add(m[1]!);
  if (URL_VARIABLE.test(texto) && !AYUDANTES.includes(archivo)) {
    problemas.push(`${archivo}: /rest/v1/rpc/\${…} en un ayudante que no está en AYUDANTES`);
  }
  return { nombres: [...nombres].sort(), problemas };
}

function archivosTs(raiz: string, carpeta: string): string[] {
  const dir = path.join(raiz, carpeta);
  return readdirSync(dir).flatMap((nombre) => {
    if (nombre === 'node_modules') return [];
    const relativo = `${carpeta}/${nombre}`;
    if (statSync(path.join(raiz, relativo)).isDirectory()) return archivosTs(raiz, relativo);
    return nombre.endsWith('.ts') && !nombre.endsWith('.test.ts') ? [relativo] : [];
  });
}

/**
 * Cada RPC de servicio de functions/**, scripts/** y workers/**, con los archivos que la llaman, y lo
 * que el escáner no ha sabido leer (`problemas`, que hacen fallar el test).
 */
export function rpcDeServicio(raiz = process.cwd()): { donde: Map<string, string[]>; problemas: string[] } {
  const donde = new Map<string, string[]>();
  const problemas: string[] = [];
  const carpetas = CARPETAS.filter((c) => existsSync(path.join(raiz, c)));
  for (const archivo of carpetas.flatMap((c) => archivosTs(raiz, c)).sort()) {
    if (archivo in AJENOS) continue;
    const escaneo = rpcEnTexto(readFileSync(path.join(raiz, archivo), 'utf8'), archivo);
    problemas.push(...escaneo.problemas);
    for (const nombre of escaneo.nombres) donde.set(nombre, [...(donde.get(nombre) ?? []), archivo]);
  }
  return { donde: new Map([...donde].sort(([a], [b]) => a.localeCompare(b))), problemas };
}

/** Las RPC que comprueba el pgTAP 40: las filas `('fn_x', …)` de su lista `rpc_de_servicio`. */
export function rpcEnPgtap(sql: string): string[] {
  const lista = /rpc_de_servicio\s*\(\s*nombre\s*,\s*argumentos\s*\)\s*as\s*\(\s*values([\s\S]*?)\)\s*select/i.exec(
    sql,
  );
  if (!lista) return [];
  return [...lista[1]!.matchAll(/\(\s*'([a-z_][a-z0-9_]*)'/g)].map((m) => m[1]!).sort();
}

/** El número de `select plan(N)` del pgTAP. */
export function planDePgtap(sql: string): number | null {
  const m = /select\s+plan\s*\(\s*(\d+)\s*\)/i.exec(sql);
  return m ? Number(m[1]) : null;
}

/** Comprobaciones del pgTAP 40 fuera de la lista: el permiso `usage` sobre el esquema hidrantes. */
export const COMPROBACIONES_FIJAS = 1;

/** Lo que no cuadra entre el código y el pgTAP, en frases para el PR. */
export function diferencias(codigo: string[], pgtap: string[], plan: number | null): string[] {
  const p: string[] = [];
  for (const n of codigo.filter((n) => !pgtap.includes(n)))
    p.push(`${n}: se llama con service_role y ${PGTAP} no la comprueba`);
  for (const n of pgtap.filter((n) => !codigo.includes(n))) p.push(`${n}: ${PGTAP} la comprueba y ya nadie la llama`);
  const esperado = pgtap.length + COMPROBACIONES_FIJAS;
  if (plan !== esperado) p.push(`${PGTAP}: plan(${plan ?? '?'}) y tendría que ser ${esperado}`);
  return p;
}

async function principal(): Promise<void> {
  const { donde, problemas: sinLeer } = rpcDeServicio();
  for (const [nombre, archivos] of donde) log.info(`${nombre}  (${archivos.join(', ')})`);
  if (sinLeer.length) abortar(`Llamadas que el escáner no sabe leer:\n${sinLeer.map((x) => `- ${x}`).join('\n')}`);
  if (!argumentos().banderas.has('comprobar')) return;
  const sql = readFileSync(PGTAP, 'utf8');
  const problemas = diferencias([...donde.keys()], rpcEnPgtap(sql), planDePgtap(sql));
  if (problemas.length) abortar(`RPC de servicio:\n${problemas.map((x) => `- ${x}`).join('\n')}`);
  log.ok(`${donde.size} RPC de servicio, todas en ${PGTAP}.`);
}

if (import.meta.main) ejecutarScript(principal);
