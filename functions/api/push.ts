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
 * (el push y fn_resultado_notificacion): 20 × 2 + la autorización + la reclamación + el aplazamiento
 * de los 429 = 43 (RV-08, RV-84).
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
  // Avisos que no se envían porque su servicio de push ha contestado 429 (RV-84), y cuánto pide
  // esperar el que más.
  const aplazados: number[] = [];
  let esperar_s = 0;
  // Servicios de push (origen del endpoint) que han contestado 429 en esta invocación.
  const enEspera = new Set<string>();
  for (const n of pendientes.datos) {
    const servicio = origenDe(n.suscripcion.endpoint);
    if (enEspera.has(servicio)) {
      aplazados.push(n.id);
      continue;
    }
    let r: Awaited<ReturnType<typeof enviar>>;
    try {
      r = await enviar(
        n.suscripcion,
        { titulo: n.titulo, cuerpo: n.cuerpo, url: n.url },
        vapid,
        destinoDePruebas(env, n.suscripcion.endpoint),
      );
    } catch {
      // No se sabe si salió: queda reclamado y se reintenta a los 15 minutos.
      sin_anotar++;
      continue;
    }
    if (r.aplazar_s !== undefined) {
      // 429 (RV-84): no es un fallo de la suscripción ni del aviso. No se anota: se aplaza abajo.
      enEspera.add(servicio);
      aplazados.push(n.id);
      // Como mucho un día (el TTL del aviso): fn_aplazar_notificaciones recibe un integer.
      esperar_s = Math.min(Math.max(esperar_s, r.aplazar_s), 86_400);
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
  if (aplazados.length > 0) {
    // Vuelven a poder reclamarse pasado Retry-After y sin gastar intento. Si esta llamada falla,
    // siguen reclamados y salen a los 15 minutos, como cualquier aviso sin anotar.
    const aplazado = await rpc(env, 'fn_aplazar_notificaciones', { ids: aplazados, segundos: esperar_s });
    if (!aplazado.ok) sin_anotar += aplazados.length;
  }
  // Si todo el lote se ha aplazado, el Worker no vuelve a llamar enseguida.
  return json({
    enviadas,
    fallidas,
    sin_anotar,
    aplazadas: aplazados.length,
    quedan: pendientes.datos.length === LOTE && aplazados.length < LOTE,
  });
};

/**
 * Con `PUSH_ENDPOINT_PRUEBAS` y un Supabase local, el mismo camino y la misma consulta del endpoint en
 * el servidor de push falso de las pruebas (RV-86). En cualquier otro caso, el endpoint tal cual: la
 * variable no puede desviar avisos de verdad aunque llegara a staging o a producción (DEC-120).
 */
export function destinoDePruebas(env: Env, endpoint: string): string {
  if (!env.PUSH_ENDPOINT_PRUEBAS || !esLocal(env.SUPABASE_URL)) return endpoint;
  try {
    const original = new URL(endpoint);
    const falso = new URL(env.PUSH_ENDPOINT_PRUEBAS);
    if (!esLocal(falso.href)) return endpoint;
    return `${falso.origin}${original.pathname}${original.search}`;
  } catch {
    return endpoint;
  }
}

function esLocal(url: string | undefined): boolean {
  try {
    const host = new URL(url ?? '').hostname;
    return host === '127.0.0.1' || host === 'localhost';
  } catch {
    return false;
  }
}

function origenDe(endpoint: string): string {
  try {
    return new URL(endpoint).origin;
  } catch {
    return endpoint;
  }
}
