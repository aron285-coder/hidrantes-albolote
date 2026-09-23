// POST /api/verificar-codigo (05 §9, 11 §3): canje del código de acceso por un token de dispositivo.
// Es la única capa que ve la IP real (CF-Connecting-IP) y la guarda como sha256(SAL_IP + ip), con la
// IP normalizada: en IPv6 cuenta el /64 (RV-14).

import {
  type Env,
  type Manejador,
  error,
  esUuid,
  esperar,
  json,
  leerJson,
  normalizarIp,
  rpc,
  sha256Hex,
} from '../_lib/comun.ts';

/** Toda respuesta tarda al menos esto: el tiempo no revela si el código estaba cerca (TR-42). */
export const DURACION_MINIMA_MS = 800;

interface Canje {
  token: string | null;
  caduca_en: string | null;
  error: string | null;
}

export const onRequestPost: Manejador = async ({ request, env }) => {
  const inicio = Date.now();
  const respuesta = await canjear(request, env);
  await esperar(Math.max(0, DURACION_MINIMA_MS - (Date.now() - inicio)));
  return respuesta;
};

async function canjear(request: Request, env: Env): Promise<Response> {
  const cuerpo = await leerJson(request);
  if (!cuerpo || typeof cuerpo.codigo !== 'string' || !esUuid(cuerpo.dispositivo_id)) {
    return error(400, 'PAYLOAD_INVALIDO');
  }
  const ip = request.headers.get('CF-Connecting-IP') ?? 'desconocida';
  const r = await rpc<Canje[]>(env, 'fn_verificar_codigo', {
    codigo: cuerpo.codigo.trim().slice(0, 12),
    dispositivo_id: cuerpo.dispositivo_id,
    ip_hash: await sha256Hex(env.SAL_IP + normalizarIp(ip)),
  });
  if (!r.ok) return error(r.estado === 503 ? 503 : 500, r.codigo);
  const fila = r.datos[0];
  if (fila?.error === 'DEMASIADOS_INTENTOS') return error(429, 'DEMASIADOS_INTENTOS', { reintentar_en_s: 3600 });
  if (!fila?.token) return error(401, 'CODIGO_INCORRECTO');
  return json({ token: fila.token, caduca_en: fila.caduca_en });
}
