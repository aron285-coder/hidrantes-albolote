// POST /api/lanzar-workflow (05 §9, FR-144, FR-165, RV-146, DEC-175). Solo jefatura, y solo trabajos
// de la lista. La Function no habla con GitHub ni guarda ningún token: deja un pedido en la base de
// datos (fn_pedir_trabajo, con la sesión de quien lo pide, que lo anota en el registro) y
// despachador.yml, en producción, lo recoge cada 15 minutos y lanza el workflow que toca.
//
// En staging, `purgar-fotos` y `respaldo` no se piden: esos workflows trabajan contra producción, y
// el panel de pruebas no puede tocar producción. Los demás se piden en la base de datos de staging,
// donde nadie los despacha (docs/15). Sin ENTORNO, o con un valor que no sea `produccion`, cuenta
// como staging: lo seguro.

import { type Env, type Manejador, error, esAdmin, json, jwtDe, leerJson, rpc } from '../_lib/comun.ts';

export const WORKFLOWS = ['purgar-fotos', 'regenerar-zona', 'regenerar-mapabase', 'respaldo'] as const;
export type Workflow = (typeof WORKFLOWS)[number];

/** Trabajos que solo actúan sobre producción: desde staging, 409 SOLO_EN_PRODUCCION. */
export const SOLO_PRODUCCION = ['purgar-fotos', 'respaldo'] as const satisfies readonly Workflow[];

const enProduccion = (env: Env) => env.ENTORNO === 'produccion';

export const onRequestPost: Manejador = async ({ request, env }) => {
  const jwt = jwtDe(request);
  if (!jwt || !(await esAdmin(env, jwt))) return error(403, 'NO_AUTORIZADO');
  const cuerpo = await leerJson(request);
  const workflow = cuerpo?.workflow;
  if (typeof workflow !== 'string' || !(WORKFLOWS as readonly string[]).includes(workflow)) {
    return error(400, 'PAYLOAD_INVALIDO');
  }
  if (!enProduccion(env) && (SOLO_PRODUCCION as readonly string[]).includes(workflow)) {
    return error(409, 'SOLO_EN_PRODUCCION');
  }

  const r = await rpc(env, 'fn_pedir_trabajo', { workflow }, { jwt });
  if (!r.ok) {
    if (r.codigo === 'YA_PEDIDO') return error(409, 'YA_PEDIDO');
    if (r.codigo === 'NO_AUTORIZADO') return error(403, 'NO_AUTORIZADO');
    if (r.codigo === 'PAYLOAD_INVALIDO') return error(400, 'PAYLOAD_INVALIDO');
    return error(r.estado === 503 ? 503 : 500, r.codigo);
  }
  return json({ pedido: true, workflow }, 202);
};
