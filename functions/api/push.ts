// POST /api/push (05 §9, FR-163–FR-164): envía las notificaciones pendientes por Web Push.
// Lo llaman el móvil tras sincronizar ({ token }), jefatura (Authorization) o la vigilancia diaria
// (X-Vigilancia). Idempotente: cada aviso se reclama en la base de datos antes de enviarse.

import { type Env, type Manejador, error, esAdmin, json, jwtDe, leerJson, rpc } from '../_lib/comun.ts';
import { type Suscripcion, enviar } from '../_lib/webpush.ts';

interface Pendiente {
  id: number;
  titulo: string;
  cuerpo: string;
  url: string | null;
  suscripcion_id: string;
  suscripcion: Suscripcion;
}

function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function autorizado(request: Request, env: Env): Promise<boolean> {
  const vigilancia = request.headers.get('X-Vigilancia');
  if (vigilancia && env.VIGILANCIA_SECRETO) return iguales(vigilancia, env.VIGILANCIA_SECRETO);
  const jwt = jwtDe(request);
  if (jwt) return esAdmin(env, jwt);
  const cuerpo = await leerJson(request);
  if (typeof cuerpo?.token !== 'string') return false;
  // Validar el token cuesta una lectura mínima: solo lo cambiado desde ahora.
  const r = await rpc(env, 'fn_listar_puntos', { token: cuerpo.token, desde: new Date().toISOString() });
  return r.ok;
}

export const onRequestPost: Manejador = async ({ request, env }) => {
  if (!(await autorizado(request, env))) return error(401, 'NO_AUTORIZADO');
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return error(503, 'NO_CONFIGURADO');

  const pendientes = await rpc<Pendiente[]>(env, 'fn_reclamar_notificaciones', { limite: 100 });
  if (!pendientes.ok) return error(503, 'SERVIDOR_NO_DISPONIBLE');

  const vapid = { publica: env.VAPID_PUBLIC_KEY, privada: env.VAPID_PRIVATE_KEY, sujeto: env.VAPID_SUBJECT };
  let enviadas = 0;
  let fallidas = 0;
  for (const n of pendientes.datos) {
    const r = await enviar(n.suscripcion, { titulo: n.titulo, cuerpo: n.cuerpo, url: n.url }, vapid);
    await rpc(env, 'fn_resultado_notificacion', {
      notificacion_id: n.id,
      ok: r.ok,
      error: r.error ?? null,
      suscripcion_caducada: r.caducada,
    });
    if (r.ok) enviadas++;
    else fallidas++;
  }
  return json({ enviadas, fallidas });
};
