// El despachador de los trabajos que pide jefatura desde el panel (docs/31 RV-137 y RV-146). El panel
// ya no lanza workflows con un token de GitHub: /api/lanzar-workflow deja un pedido en la base de datos
// (fn_pedir_trabajo) y despachador.yml, cada 15 minutos, lo recoge en tres trabajos (docs/32 RV-201):
//
//   leer     node scripts/despachar.ts leer     fn_pedidos_pendientes() → los pedidos sin lanzar, con
//                                               el trabajo validado contra la lista (solo service_role)
//   lanzar   (en el propio despachador.yml)     workflow_dispatch de cada uno; el único trabajo con
//                                               actions: write, sin checkout ni la clave de servicio
//   marcar   node scripts/despachar.ts marcar   fn_marcar_pedido(id, resultado) → 'lanzado' o 'error: …'
//
// Así el código que lee la base de datos con la clave de servicio no tiene un token que pueda borrar
// artifacts (el único respaldo, DEC-180), y el que lo tiene no corre nada del repositorio.
//
// Solo lee los pedidos de **producción**: los de staging se quedan en su base de datos y nadie los
// despacha (RV-146). Un pedido con error no se reintenta solo: jefatura lo vuelve a pedir.

import { appendFileSync } from 'node:fs';
import { abortar, ejecutarScript, log } from './lib/comun.ts';

export const WORKFLOWS = ['purgar-fotos', 'regenerar-zona', 'regenerar-mapabase', 'respaldo'] as const;
export type Workflow = (typeof WORKFLOWS)[number];

// Qué archivo atiende cada trabajo, y con qué entradas: GitHub rechaza con 422 una entrada que el
// workflow no declara. El trabajo «lanzar» de despachador.yml tiene la misma tabla en un `case`;
// scripts/despachar.test.ts comprueba que coinciden.
export const ARCHIVO: Record<Workflow, { archivo: string; entradas?: Record<string, string> }> = {
  'purgar-fotos': { archivo: 'purgar-fotos.yml' },
  'regenerar-zona': { archivo: 'mantenimiento.yml', entradas: { trabajo: 'regenerar-zona' } },
  'regenerar-mapabase': { archivo: 'mantenimiento.yml', entradas: { trabajo: 'regenerar-mapabase' } },
  respaldo: { archivo: 'respaldo.yml' },
};

/** La rama desde la que corren: la única que admite el environment prod-tareas (RV-131). */
export const RAMA = 'develop';

export interface Pedido {
  id: string | number;
  workflow: string;
}

/** Un pedido con lo que le ha pasado: lo que se anota con fn_marcar_pedido. */
export interface Resultado {
  id: string | number;
  trabajo: string;
  resultado: string;
}

export interface Entorno {
  supabaseUrl: string;
  servicio: string;
  fetch?: typeof fetch;
}

export interface Resumen {
  lanzados: number;
  fallidos: number;
  /** «trabajo: error: …», uno por pedido que no se ha lanzado. */
  errores: string[];
  /** Los pedidos que el trabajo «lanzar» no ha devuelto: siguen pendientes. */
  sinResultado: string[];
}

/** El motivo de un fallo de red (DNS, TLS, tiempo agotado), sin la URL ni las cabeceras. */
function motivoRed(e: unknown): string {
  const causa = (e as { cause?: { code?: unknown } } | null)?.cause?.code;
  if (typeof causa === 'string') return causa;
  return e instanceof Error ? e.name : 'desconocido';
}

/** Una línea, corta: lo que se anota en el pedido y en la issue. */
const unaLinea = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, 200);

async function rpc(e: Entorno, nombre: string, cuerpo: object): Promise<Response> {
  const f = e.fetch ?? fetch;
  const r = await f(`${e.supabaseUrl}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: {
      apikey: e.servicio,
      Authorization: `Bearer ${e.servicio}`,
      'Content-Type': 'application/json',
      'Content-Profile': 'hidrantes',
      'Accept-Profile': 'hidrantes',
    },
    body: JSON.stringify(cuerpo),
  }).catch((x: unknown) => motivoRed(x));
  if (typeof r === 'string') abortar(`La base de datos no respondió a ${nombre} (${r}).`);
  return r;
}

/** Los pedidos sin lanzar. Una respuesta rara para todo: mejor no despachar que despachar mal. */
export async function pendientes(e: Entorno): Promise<Pedido[]> {
  const r = await rpc(e, 'fn_pedidos_pendientes', {});
  // Sin 0040 (producción antes de 0.9.0) no puede haber pedidos: el panel de esa versión aún lanza
  // los workflows él mismo. Solo «la función no existe» de PostgREST; cualquier otro 404 se para.
  if (r.status === 404) {
    const codigo = (
      (await r
        .clone()
        .json()
        .catch(() => null)) as { code?: unknown } | null
    )?.code;
    if (codigo === 'PGRST202') {
      log.aviso('La base de datos aún no tiene fn_pedidos_pendientes (0040): no hay pedidos que despachar.');
      return [];
    }
  }
  if (!r.ok) abortar(`fn_pedidos_pendientes respondió ${r.status}.`);
  const filas: unknown = await r.json().catch(() => null);
  if (!Array.isArray(filas)) abortar('fn_pedidos_pendientes no devolvió una lista.');
  return filas.map((f: unknown) => {
    const p = f as Partial<Pedido> | null;
    if (!p || (typeof p.id !== 'string' && typeof p.id !== 'number') || typeof p.workflow !== 'string') {
      abortar('fn_pedidos_pendientes devolvió una fila sin id o sin workflow.');
    }
    return { id: p.id, workflow: p.workflow };
  });
}

/**
 * Los que se pueden lanzar (con un trabajo de la lista) y los que no, ya con su error. Al trabajo
 * «lanzar» solo le llegan nombres de la lista; él los vuelve a comprobar en su `case`.
 */
export function separar(pedidos: Pedido[]): { lanzar: Pedido[]; rechazados: Resultado[] } {
  const lanzar: Pedido[] = [];
  const rechazados: Resultado[] = [];
  for (const p of pedidos) {
    if ((WORKFLOWS as readonly string[]).includes(p.workflow)) lanzar.push(p);
    else
      rechazados.push({
        id: p.id,
        trabajo: p.workflow,
        resultado: unaLinea(`error: trabajo desconocido (${p.workflow})`),
      });
  }
  return { lanzar, rechazados };
}

/**
 * Anota el resultado. Si no se puede, se para y la ejecución falla: el pedido sigue pendiente y el
 * siguiente pase lo lanzaría otra vez (los workflows de la tabla aguantan una segunda ejecución:
 * todos tienen concurrency sin cancelar).
 */
export async function marcar(e: Entorno, id: Pedido['id'], resultado: string): Promise<void> {
  const r = await rpc(e, 'fn_marcar_pedido', { id, resultado });
  if (!r.ok) abortar(`fn_marcar_pedido respondió ${r.status} para el pedido ${id} (${resultado}).`);
}

/** Lo que llega del trabajo «lanzar»: solo 'lanzado' o 'error: …', en una línea. */
function normalizar(resultado: unknown): string {
  if (resultado === 'lanzado') return resultado;
  if (typeof resultado === 'string' && resultado.startsWith('error: ')) return unaLinea(resultado);
  return 'error: el trabajo lanzar devolvió un resultado que no se entiende';
}

/**
 * Anota los pedidos que se han intentado lanzar (con lo que devolvió el trabajo «lanzar») y los
 * rechazados por «leer». Un pedido sin resultado (el trabajo «lanzar» no llegó a él) no se anota:
 * sigue pendiente y la pasada siguiente lo lanza.
 *
 * Va llenando `resumen` a medida que anota: si se para a mitad (fn_marcar_pedido falla), el que
 * llama aún sabe qué errores se han anotado ya y los lleva a su issue.
 */
export async function marcarTodos(
  e: Entorno,
  pedidos: Pedido[],
  rechazados: Resultado[],
  resultados: Resultado[],
  resumen: Resumen = { lanzados: 0, fallidos: 0, errores: [], sinResultado: [] },
): Promise<Resumen> {
  const porId = new Map(resultados.map((r) => [String(r.id), r.resultado]));
  const anotar = async (id: Pedido['id'], trabajo: string, resultado: string) => {
    await marcar(e, id, resultado);
    if (resultado === 'lanzado') {
      resumen.lanzados++;
      log.ok(`${trabajo}: lanzado`);
    } else {
      resumen.fallidos++;
      resumen.errores.push(`${trabajo}: ${resultado}`);
      log.error(`${trabajo}: ${resultado}`);
    }
  };
  for (const p of pedidos) {
    if (!porId.has(String(p.id))) {
      resumen.sinResultado.push(`${p.workflow} (pedido ${p.id})`);
      continue;
    }
    await anotar(p.id, p.workflow, normalizar(porId.get(String(p.id))));
  }
  for (const r of rechazados) await anotar(r.id, r.trabajo, normalizar(r.resultado));
  return resumen;
}

/**
 * Un JSON de las salidas de otro trabajo, que tiene que ser una lista. Si es `obligatoria`, vacía o
 * sin definir es un error: PEDIDOS y RECHAZADOS los escribe siempre «leer», y sin ellos «marcar» no
 * sabe qué pedidos se han intentado lanzar. RESULTADOS sí puede faltar: «lanzar» no corre sin pedidos.
 */
export function lista<T>(nombre: string, texto: string | undefined, obligatoria = false): T[] {
  if (obligatoria && !texto?.trim()) abortar(`Falta ${nombre}: el trabajo leer no lo ha pasado.`);
  let valor: unknown;
  try {
    valor = JSON.parse(texto?.trim() || '[]');
  } catch {
    abortar(`${nombre} no es JSON.`);
  }
  if (!Array.isArray(valor)) abortar(`${nombre} no es una lista.`);
  return valor as T[];
}

function salida(nombre: string, valor: string): void {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `${nombre}<<FIN_${nombre.toUpperCase()}\n${valor}\nFIN_${nombre.toUpperCase()}\n`,
  );
}

async function principal(): Promise<void> {
  const modo = process.argv[2];
  if (modo !== 'leer' && modo !== 'marcar') abortar('Uso: node scripts/despachar.ts leer|marcar');
  const supabaseUrl = process.env.SUPABASE_URL;
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !servicio) abortar('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  const e: Entorno = { supabaseUrl, servicio };

  if (modo === 'leer') {
    const { lanzar, rechazados } = separar(await pendientes(e));
    log.info(`${lanzar.length} pedidos que lanzar, ${rechazados.length} desconocidos.`);
    salida('pedidos', JSON.stringify(lanzar.map((p) => ({ id: p.id, trabajo: p.workflow }))));
    salida('rechazados', JSON.stringify(rechazados));
    salida('hay', lanzar.length + rechazados.length > 0 ? 'si' : 'no');
    return;
  }

  const pedidos = lista<{ id: Pedido['id']; trabajo: string }>('PEDIDOS', process.env.PEDIDOS, true).map((p) => ({
    id: p.id,
    workflow: p.trabajo,
  }));
  const rechazados = lista<Resultado>('RECHAZADOS', process.env.RECHAZADOS, true);
  const resultados = lista<Resultado>('RESULTADOS', process.env.RESULTADOS);
  const r: Resumen = { lanzados: 0, fallidos: 0, errores: [], sinResultado: [] };
  try {
    await marcarTodos(e, pedidos, rechazados, resultados, r);
  } finally {
    // También si se para a mitad: los errores ya anotados no se reintentan y tienen que llegar a su
    // issue, que solo se abre con con_error.
    if (r.errores.length) salida('con_error', r.errores.join('\n'));
  }
  const texto = `${r.lanzados} lanzados, ${r.fallidos} con error, ${r.sinResultado.length} sin lanzar.`;
  log.info(texto);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Despachador\n\n${texto}\n`);
  }
  // Un pedido con error no hace fallar la ejecución: ya está anotado y no se reintenta, así que la
  // pasada siguiente iría bien y cerraría la issue sin que nadie la viera. Va a su propia issue, que
  // no se cierra sola (despachador.yml). Fallar es para lo que impide despachar: leer, lanzar o marcar.
  if (r.sinResultado.length) {
    abortar(
      `El trabajo lanzar no ha devuelto el resultado de: ${r.sinResultado.join(', ')}. Se quedan pendientes y la pasada siguiente los vuelve a lanzar; si «lanzar» se cortó después de lanzar alguno, ese correrá dos veces (los cuatro workflows lo aguantan: concurrency sin cancelar).`,
    );
  }
}

if (import.meta.main) ejecutarScript(principal);
