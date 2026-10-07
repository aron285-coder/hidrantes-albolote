// POST /api/error (05 §9, TR-90, TR-106, RV-148): los errores del cliente. Es la única capa que ve
// la IP real (CF-Connecting-IP): la pasa como sha256(SAL_IP + ip normalizada), con IPv6 por /64
// (RV-14), a la firma de seis argumentos de fn_registrar_error (0040, solo service_role), que aplica
// el tope por IP. La IP nunca se guarda en claro, y aquí no se registra nada.

import { type Manejador, error, esUuid, leerJson, normalizarIp, rpc, sha256Hex } from '../_lib/comun.ts';

/** Los mismos recortes que hace la base de datos (0005, 0040). */
const MAXIMO = { mensaje: 1000, pila: 4096, ruta: 200, agente: 300 } as const;

const textoOpcional = (v: unknown, max: number): string | null | undefined =>
  v === undefined || v === null ? null : typeof v === 'string' ? v.slice(0, max) : undefined;

export const onRequestPost: Manejador = async ({ request, env }) => {
  const cuerpo = await leerJson(request);
  if (!cuerpo || typeof cuerpo.mensaje !== 'string' || cuerpo.mensaje.trim() === '') {
    return error(400, 'PAYLOAD_INVALIDO');
  }
  const dispositivo = cuerpo.dispositivo_id ?? null;
  if (dispositivo !== null && !esUuid(dispositivo)) return error(400, 'PAYLOAD_INVALIDO');
  const pila = textoOpcional(cuerpo.pila, MAXIMO.pila);
  const ruta = textoOpcional(cuerpo.ruta, MAXIMO.ruta);
  const agente = textoOpcional(cuerpo.agente, MAXIMO.agente);
  if (pila === undefined || ruta === undefined || agente === undefined) return error(400, 'PAYLOAD_INVALIDO');

  // Sin cabecera (solo fuera de Cloudflare) no se inventa una IP: lo que llega sin ella tiene su
  // propio cupo en la base de datos (max_errores_sin_ip_dia).
  const ip = request.headers.get('CF-Connecting-IP');
  const r = await rpc(env, 'fn_registrar_error', {
    dispositivo_id: dispositivo,
    mensaje: cuerpo.mensaje.slice(0, MAXIMO.mensaje),
    pila,
    ruta,
    agente,
    ip_hash: ip ? await sha256Hex(env.SAL_IP + normalizarIp(ip)) : null,
  });
  if (!r.ok) return error(r.estado === 503 ? 503 : 500, r.codigo);
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
};
