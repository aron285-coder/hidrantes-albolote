// POST /api/lanzar-workflow (05 §9, FR-144, FR-165). Solo jefatura, y solo workflows de la lista.
// GITHUB_DISPATCH_TOKEN llega en la Fase 7 (DEC-055): hasta entonces responde 503 con el motivo.

import { type Manejador, error, esAdmin, json, jwtDe, leerJson, rpc } from '../_lib/comun.ts';

export const WORKFLOWS = ['purgar-fotos', 'regenerar-zona', 'regenerar-mapabase', 'respaldo'] as const;
const REPO = 'aron285-coder/hidrantes-albolote';

export const onRequestPost: Manejador = async ({ request, env }) => {
  const jwt = jwtDe(request);
  if (!(await esAdmin(env, jwt))) return error(403, 'NO_AUTORIZADO');
  const cuerpo = await leerJson(request);
  const workflow = cuerpo?.workflow;
  if (typeof workflow !== 'string' || !(WORKFLOWS as readonly string[]).includes(workflow)) {
    return error(400, 'PAYLOAD_INVALIDO');
  }
  if (!env.GITHUB_DISPATCH_TOKEN) return error(503, 'NO_CONFIGURADO');

  const r = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'hidrantes-albolote',
    },
    body: JSON.stringify({ event_type: workflow }),
  }).catch(() => null);
  if (!r || r.status !== 204) return error(503, 'SERVIDOR_NO_DISPONIBLE');

  await rpc(env, 'fn_registrar_workflow', { workflow }, { jwt: jwt! });
  return json({ lanzada: true, workflow }, 202);
};
