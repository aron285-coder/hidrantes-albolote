// POST /api/lanzar-workflow (05 §9, FR-144, FR-165). Solo jefatura, y solo workflows de la lista.
// Se lanza con `workflow_dispatch`, no con `repository_dispatch`: así GITHUB_DISPATCH_TOKEN vive
// con el permiso único `actions:write` que pide 04 §10. `repository_dispatch` exigiría
// `contents:write`, es decir, empujar a `develop` —que despliega solo— si el secreto se filtrara
// (DEC-069). El trabajo que aún no tiene workflow responde NO_CONFIGURADO, no un fallo mudo.

import { type Manejador, error, esAdmin, json, jwtDe, leerJson, rpc } from '../_lib/comun.ts';

export const WORKFLOWS = ['purgar-fotos', 'regenerar-zona', 'regenerar-mapabase', 'respaldo'] as const;
export type Workflow = (typeof WORKFLOWS)[number];

// Qué archivo atiende cada trabajo, y con qué entradas: GitHub rechaza con 422 una entrada que el
// workflow no declara, así que cada uno lleva las suyas. El de la purga de fotos llega con su
// workflow (Fase 8); hasta entonces ese trabajo responde NO_CONFIGURADO.
export const ARCHIVO: Partial<Record<Workflow, { archivo: string; entradas?: Record<string, string> }>> = {
  'regenerar-zona': { archivo: 'mantenimiento.yml', entradas: { trabajo: 'regenerar-zona' } },
  'regenerar-mapabase': { archivo: 'mantenimiento.yml', entradas: { trabajo: 'regenerar-mapabase' } },
  respaldo: { archivo: 'respaldo.yml' },
};

const REPO = 'aron285-coder/hidrantes-albolote';
// La rama que se regenera y desde la que sale el PR; nunca se toca `main` desde aquí.
const RAMA = 'develop';

export const onRequestPost: Manejador = async ({ request, env }) => {
  const jwt = jwtDe(request);
  if (!(await esAdmin(env, jwt))) return error(403, 'NO_AUTORIZADO');
  const cuerpo = await leerJson(request);
  const workflow = cuerpo?.workflow;
  if (typeof workflow !== 'string' || !(WORKFLOWS as readonly string[]).includes(workflow)) {
    return error(400, 'PAYLOAD_INVALIDO');
  }
  const trabajo = ARCHIVO[workflow as Workflow];
  if (!env.GITHUB_DISPATCH_TOKEN || !trabajo) return error(503, 'NO_CONFIGURADO');

  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${trabajo.archivo}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'hidrantes-albolote',
    },
    body: JSON.stringify({ ref: RAMA, ...(trabajo.entradas ? { inputs: trabajo.entradas } : {}) }),
  }).catch(() => null);
  if (!r || r.status !== 204) return error(503, 'SERVIDOR_NO_DISPONIBLE');

  await rpc(env, 'fn_registrar_workflow', { workflow }, { jwt: jwt! });
  return json({ lanzada: true, workflow }, 202);
};
