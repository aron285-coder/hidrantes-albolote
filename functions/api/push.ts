// POST /api/push (05 §9, FR-163–FR-164): envía las notificaciones pendientes por Web Push.
// Lo llaman el móvil tras sincronizar o enviar ({ token }), jefatura tras moderar (Authorization)
// y avisos.yml cada 15 minutos (X-Vigilancia). Cada aviso se reclama en la base de datos antes de
// enviarse y solo cuenta como enviado cuando su resultado queda anotado (RV-08).

import { type Env, type Manejador, error, esAdmin, iguales, json, jwtDe, leerJson, rpc } from '../_lib/comun.ts';
import { type Suscripcion, enviar } from '../_lib/webpush.ts';

interface Pendiente {
  id: number;
  titulo: string;
  cuerpo: string;
  url: string | null;
  suscripcion_id: string;
  suscripcion: Suscripcion;
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

/**
 * El plan gratuito de Workers permite 50 peticiones de salida por invocación y cada aviso gasta dos
 * (el push y fn_resultado_notificacion): 20 × 2 + la autorización + la reclamación = 42 (RV-08).
 */
export const LOTE = 20;

export const onRequestPost: Manejador = async ({ request, env }) => {
  if (!(await autorizado(request, env))) return error(401, 'NO_AUTORIZADO');
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return error(503, 'NO_CONFIGURADO');

  const pendientes = await rpc<Pendiente[]>(env, 'fn_reclamar_notificaciones', { limite: LOTE });
  if (!pendientes.ok) return error(503, 'SERVIDOR_NO_DISPONIBLE');

  const vapid = { publica: env.VAPID_PUBLIC_KEY, privada: env.VAPID_PRIVATE_KEY, sujeto: env.VAPID_SUBJECT };
  let enviadas = 0;
  let fallidas = 0;
  let sin_anotar = 0;
  for (const n of pendientes.datos) {
    let r: Awaited<ReturnType<typeof enviar>>;
    try {
      r = await enviar(n.suscripcion, { titulo: n.titulo, cuerpo: n.cuerpo, url: n.url }, vapid);
    } catch {
      // No se sabe si salió: queda reclamado y se reintenta a los 15 minutos.
      sin_anotar++;
      continue;
    }
    const anotado = await rpc(env, 'fn_resultado_notificacion', {
      notificacion_id: n.id,
      ok: r.ok,
      error: r.error ?? null,
      suscripcion_caducada: r.caducada,
    });
    // Sin anotar, el aviso sigue reclamado y volverá a salir a los 15 minutos. Un duplicado es
    // preferible a una pérdida.
    if (!anotado.ok) sin_anotar++;
    if (r.ok) enviadas++;
    else fallidas++;
  }
  return json({ enviadas, fallidas, sin_anotar, quedan: pendientes.datos.length === LOTE });
};
