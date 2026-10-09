// Las RPC que se llaman con service_role, sin JWT de usuario (docs/33 RV-305, seguimiento de D1). Solo lectura.
//
//   npx tsx scripts/rpc-de-servicio.ts               lista las RPC encontradas
//   npx tsx scripts/rpc-de-servicio.ts --comprobar   falla si supabase/tests/40 no lista las mismas
//
// D1 (#561) pasó porque ninguna prueba miraba que service_role pudiera ejecutar lo que llaman las
// Functions. supabase/tests/40_permisos_service_role.test.sql lo comprueba con pgTAP para cada RPC de
// esta lista, y scripts/rpc-de-servicio.test.ts (vitest, en CI) falla si las dos listas no coinciden.
//
// Qué lee, en functions/** y scripts/** (*.ts, sin los *.test.ts):
// - `rpc(env, 'fn_x'` / `rpc<T>(e, 'fn_x'`: el ayudante de functions/_lib/comun.ts y el de
//   scripts/despachar.ts. Si la llamada lleva `jwt` entre sus argumentos ({ jwt }), va con la identidad
//   de quien llama y no cuenta.
// - `.rpc('fn_x'`: un cliente con método rpc.
// - `/rest/v1/rpc/fn_x` escrito en una URL (fetch directo, como scripts/purgar-fotos.ts).
// Lo que no lee: un nombre en una variable (`rpc(env, nombre, …)`), llamadas por psql (van como
// postgres, no como service_role) y los workflows de .github/ (curl con la clave anónima).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { abortar, argumentos, ejecutarScript, log } from './lib/comun.ts';

export const CARPETAS = ['functions', 'scripts'];
export const PGTAP = 'supabase/tests/40_permisos_service_role.test.sql';

/**
 * Archivos que llaman RPC sin la clave de servicio a propósito, con el motivo. Sus llamadas no cuentan.
 */
export const AJENOS: Record<string, string> = {
  'scripts/intrusion.ts': 'prueba de intrusión: llama con la clave anónima para comprobar que se rechaza',
  'scripts/rpc-de-servicio.ts': 'este mismo script: sus ejemplos no son llamadas',
};

const IDENT = String.raw`[A-Za-z_$][\w$]*`;
const NOMBRE = String.raw`['"\x60]([a-z_][a-z0-9_]*)['"\x60]`;
/** rpc(env, 'fn_x' y rpc<T>(env, 'fn_x': grupo 1, el nombre. */
const AYUDANTE = new RegExp(String.raw`(?<![\w$.])rpc\s*(?:<[^>()]*>)?\s*\(\s*${IDENT}\s*,\s*${NOMBRE}`, 'g');
const METODO = new RegExp(String.raw`\.rpc\s*\(\s*${NOMBRE}`, 'g');
const URL_RPC = /\/rest\/v1\/rpc\/([a-z_][a-z0-9_]*)\b/g;

/**
 * El texto de los argumentos de la llamada cuyo paréntesis abre en `abre`, hasta su cierre. Salta lo que
 * hay entre comillas para no contar sus paréntesis.
 */
export function argumentosDeLaLlamada(texto: string, abre: number): string {
  let nivel = 0;
  for (let i = abre; i < texto.length; i++) {
    const c = texto[i]!;
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < texto.length && texto[i] !== c; i++) if (texto[i] === '\\') i++;
      continue;
    }
    if (c === '(') nivel++;
    else if (c === ')' && --nivel === 0) return texto.slice(abre + 1, i);
  }
  return texto.slice(abre + 1);
}

/** Las RPC de servicio de un archivo, sin repetir y en orden. */
export function rpcEnTexto(texto: string): string[] {
  const nombres = new Set<string>();
  for (const m of texto.matchAll(AYUDANTE)) {
    // El tipo genérico no lleva paréntesis: el primero de la coincidencia es el de la llamada.
    const abre = m.index + m[0].indexOf('(');
    if (/\bjwt\b/.test(argumentosDeLaLlamada(texto, abre))) continue;
    nombres.add(m[1]!);
  }
  for (const m of texto.matchAll(METODO)) nombres.add(m[1]!);
  for (const m of texto.matchAll(URL_RPC)) nombres.add(m[1]!);
  return [...nombres].sort();
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

/** Cada RPC de servicio de functions/** y scripts/**, con los archivos que la llaman. */
export function rpcDeServicio(raiz = process.cwd()): Map<string, string[]> {
  const donde = new Map<string, string[]>();
  for (const archivo of CARPETAS.flatMap((c) => archivosTs(raiz, c)).sort()) {
    if (archivo in AJENOS) continue;
    for (const nombre of rpcEnTexto(readFileSync(path.join(raiz, archivo), 'utf8'))) {
      donde.set(nombre, [...(donde.get(nombre) ?? []), archivo]);
    }
  }
  return new Map([...donde].sort(([a], [b]) => a.localeCompare(b)));
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

/** Lo que no cuadra entre el código y el pgTAP, en frases para el PR. */
export function diferencias(codigo: string[], pgtap: string[], plan: number | null): string[] {
  const p: string[] = [];
  for (const n of codigo.filter((n) => !pgtap.includes(n)))
    p.push(`${n}: se llama con service_role y ${PGTAP} no la comprueba`);
  for (const n of pgtap.filter((n) => !codigo.includes(n))) p.push(`${n}: ${PGTAP} la comprueba y ya nadie la llama`);
  if (plan !== pgtap.length) p.push(`${PGTAP}: plan(${plan ?? '?'}) y la lista tiene ${pgtap.length}`);
  return p;
}

async function principal(): Promise<void> {
  const donde = rpcDeServicio();
  for (const [nombre, archivos] of donde) log.info(`${nombre}  (${archivos.join(', ')})`);
  if (!argumentos().banderas.has('comprobar')) return;
  const sql = readFileSync(PGTAP, 'utf8');
  const problemas = diferencias([...donde.keys()], rpcEnPgtap(sql), planDePgtap(sql));
  if (problemas.length) abortar(`RPC de servicio:\n${problemas.map((x) => `- ${x}`).join('\n')}`);
  log.ok(`${donde.size} RPC de servicio, todas en ${PGTAP}.`);
}

if (import.meta.main) ejecutarScript(principal);
