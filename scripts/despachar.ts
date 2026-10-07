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
//   npx tsx scripts/despachar.ts        (en despachador.yml; en local no hay nada que despachar)

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
}

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
  }).catch(() => null);
  if (!r) abortar(`La base de datos no respondió a ${nombre}.`);
  return r;
}

/** Los pedidos sin lanzar. Una respuesta rara para todo: mejor no despachar que despachar mal. */
export async function pendientes(e: Entorno): Promise<Pedido[]> {
  const r = await rpc(e, 'fn_pedidos_pendientes', {});
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
  }).catch(() => null);
  if (!r) return 'error: GitHub no respondió';
  if (r.status !== 204) return `error: GitHub respondió ${r.status}`;
  return 'lanzado';
}

/** Anota el resultado. Si no se puede, se para: el siguiente pase lo lanzaría otra vez. */
export async function marcar(e: Entorno, id: Pedido['id'], resultado: string): Promise<void> {
  const r = await rpc(e, 'fn_marcar_pedido', { id, resultado });
  if (!r.ok) abortar(`fn_marcar_pedido respondió ${r.status} para el pedido ${id} (${resultado}).`);
}

export async function despachar(e: Entorno): Promise<Resumen> {
  const resumen: Resumen = { lanzados: 0, fallidos: 0 };
  for (const p of await pendientes(e)) {
    const resultado = await lanzar(e, p.workflow);
    await marcar(e, p.id, resultado);
    if (resultado === 'lanzado') {
      resumen.lanzados++;
      log.ok(`${p.workflow}: lanzado`);
    } else {
      resumen.fallidos++;
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
  if (r.fallidos) abortar(`${r.fallidos} pedidos no se han podido lanzar: están anotados con su error.`);
}

if (import.meta.main) ejecutarScript(principal);
