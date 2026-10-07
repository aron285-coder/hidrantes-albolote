// El despachador de los trabajos que pide jefatura desde el panel (docs/31 RV-137 y RV-146). El panel
// ya no lanza workflows con un token de GitHub: /api/lanzar-workflow deja un pedido en la base de datos
// (fn_pedir_trabajo) y despachador.yml, cada 15 minutos, lo recoge aquí:
//
//   1. fn_pedidos_pendientes()            → los pedidos sin lanzar (solo service_role).
//   2. workflow_dispatch del archivo que toca, con el GITHUB_TOKEN del propio despachador.
//   3. fn_marcar_pedido(id, resultado)    → 'lanzado' o 'error: …' (solo service_role).
//
// Solo lee los pedidos de **producción**: los de staging se quedan en su base de datos y nadie los
// despacha (RV-146). Un pedido con error no se reintenta solo: jefatura lo vuelve a pedir.
//
//   node scripts/despachar.ts        (en despachador.yml, sin npm ci; en local no hay nada que despachar)

import { appendFileSync } from 'node:fs';
import { abortar, ejecutarScript, log } from './lib/comun.ts';

export const WORKFLOWS = ['purgar-fotos', 'regenerar-zona', 'regenerar-mapabase', 'respaldo'] as const;
export type Workflow = (typeof WORKFLOWS)[number];

// Qué archivo atiende cada trabajo, y con qué entradas: GitHub rechaza con 422 una entrada que el
// workflow no declara. La misma tabla que tenía /api/lanzar-workflow antes de RV-146.
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

export interface Entorno {
  supabaseUrl: string;
  servicio: string;
  githubToken: string;
  /** owner/repo */
  repo: string;
  fetch?: typeof fetch;
}

export interface Resumen {
  lanzados: number;
  fallidos: number;
  /** «trabajo: error: …», uno por pedido que no se ha lanzado. */
  errores: string[];
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

/** Lanza el workflow del pedido. Devuelve el resultado que se anota: 'lanzado' o 'error: …'. */
export async function lanzar(e: Entorno, workflow: string): Promise<string> {
  if (!(WORKFLOWS as readonly string[]).includes(workflow)) return `error: trabajo desconocido (${workflow})`;
  const { archivo, entradas } = ARCHIVO[workflow as Workflow];
  const f = e.fetch ?? fetch;
  const r = await f(`https://api.github.com/repos/${e.repo}/actions/workflows/${archivo}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${e.githubToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'hidrantes-albolote-despachador',
    },
    body: JSON.stringify({ ref: RAMA, ...(entradas ? { inputs: entradas } : {}) }),
  }).catch((x: unknown) => motivoRed(x));
  if (typeof r === 'string') return `error: GitHub no respondió (${r})`;
  if (r.status !== 204) {
    // El mensaje de GitHub dice el porqué: una entrada que el workflow no declara, sin
    // workflow_dispatch, sin permiso… No lleva el token.
    const cuerpo = await r.text().catch(() => '');
    let mensaje = cuerpo;
    try {
      const m = (JSON.parse(cuerpo) as { message?: unknown } | null)?.message;
      if (typeof m === 'string') mensaje = m;
    } catch {
      // No era JSON: se anota el texto tal cual, recortado.
    }
    return unaLinea(`error: GitHub respondió ${r.status}${mensaje ? `: ${mensaje}` : ''}`);
  }
  return 'lanzado';
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

export async function despachar(e: Entorno): Promise<Resumen> {
  const resumen: Resumen = { lanzados: 0, fallidos: 0, errores: [] };
  for (const p of await pendientes(e)) {
    const resultado = await lanzar(e, p.workflow);
    await marcar(e, p.id, resultado);
    if (resultado === 'lanzado') {
      resumen.lanzados++;
      log.ok(`${p.workflow}: lanzado`);
    } else {
      resumen.fallidos++;
      resumen.errores.push(`${p.workflow}: ${resultado}`);
      log.error(`${p.workflow}: ${resultado}`);
    }
  }
  return resumen;
}

async function principal(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const githubToken = process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!supabaseUrl || !servicio || !githubToken || !repo) {
    abortar('Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GH_TOKEN o GITHUB_REPOSITORY.');
  }
  const r = await despachar({ supabaseUrl, servicio, githubToken, repo });
  const texto = `${r.lanzados} lanzados, ${r.fallidos} con error.`;
  log.info(texto);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Despachador\n\n${texto}\n`);
  }
  // Un pedido con error no hace fallar la ejecución: ya está anotado y no se reintenta, así que la
  // pasada siguiente iría bien y cerraría la issue sin que nadie la viera. Va a su propia issue, que
  // no se cierra sola (despachador.yml). Fallar es para lo que impide despachar: leer o marcar.
  if (r.errores.length && process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `con_error<<FIN_CON_ERROR\n${r.errores.join('\n')}\nFIN_CON_ERROR\n`);
  }
}

if (import.meta.main) ejecutarScript(principal);
