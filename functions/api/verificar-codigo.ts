// POST /api/verificar-codigo (05 §9, 11 §3): canje del código de acceso por un token de dispositivo.
// Es la única capa que ve la IP real (CF-Connecting-IP) y la guarda como sha256(SAL_IP + ip), con la
// IP normalizada: en IPv6 cuenta el /48 (RV-14, docs/35 RV-401). Solo peticiones de la propia app, y
// como mucho LIMITE_CODIGO_POR_MINUTO por IP agrupada (docs/36 RV-451).

import {
  type Env,
  type Manejador,
  error,
  esUuid,
  esperar,
  exigirMismoOrigen,
  json,
  leerJson,
  normalizarIp,
  rpc,
  sha256Hex,
} from '../_lib/comun.ts';
import { crearTope } from '../_lib/limite.ts';

/** Toda respuesta tarda al menos esto: el tiempo no revela si el código estaba cerca (TR-42). */
export const DURACION_MINIMA_MS = 800;

/**
 * docs/36 RV-451 (DEC-207, 03 TR-41): intentos por minuto y por IP agrupada (IPv6 por /48) que la
 * Function deja llegar a la base de datos. Cuenta en la memoria del aislado, así que no es global: el
 * tope de verdad sigue en fn_verificar_codigo. Lo que corta aquí no llega a la base de datos.
 */
export const LIMITE_CODIGO_POR_MINUTO = 10;
const topeCodigo = crearTope(LIMITE_CODIGO_POR_MINUTO, 60_000);

const DISPOSITIVO_RESERVADO = 'DISPOSITIVO_RESERVADO';

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
  const ajena = exigirMismoOrigen(request);
  if (ajena) return ajena;
  // docs/36 RV-451: antes de leer nada, el tope por IP agrupada. Cuenta toda petición, buena o mala.
  // Responde como el turno ocupado de la base de datos (OCUPADO, 503 con Retry-After), no como
  // DEMASIADOS_INTENTOS: con ese código la app bloquea el móvil una hora, y aquí basta con esperar a
  // que la ventana se vacíe (un grupo entrando a la vez desde la misma wifi no ha fallado nada).
  const ip = normalizarIp(request.headers.get('CF-Connecting-IP') ?? 'desconocida');
  const espera = topeCodigo.pedir(`codigo:${ip}`);
  if (espera !== null) {
    return json({ error: 'OCUPADO', reintentar_en_s: espera }, 503, { 'Retry-After': String(espera) });
  }
  const cuerpo = await leerJson(request);
  if (!cuerpo || typeof cuerpo.codigo !== 'string' || !esUuid(cuerpo.dispositivo_id)) {
    return error(400, 'PAYLOAD_INVALIDO');
  }
  // Sin sal, el hash de una IPv4 se deshace por fuerza bruta: no se canjea nada.
  if (!env.SAL_IP) return error(503, 'NO_CONFIGURADO');
  const r = await rpc<Canje[]>(env, 'fn_verificar_codigo', {
    codigo: cuerpo.codigo.trim().slice(0, 12),
    dispositivo_id: cuerpo.dispositivo_id,
    ip_hash: await sha256Hex(env.SAL_IP + ip),
  });
  // RV-143 (DEC-175): el id de un administrador no se canjea. 409 sin decir de quién es; el móvil
  // genera otro id y repite una vez (RV-159). Se acepta como fila o como excepción de la base.
  if (!r.ok && r.codigo === DISPOSITIVO_RESERVADO) return error(409, DISPOSITIVO_RESERVADO);
  if (!r.ok) return error(r.estado === 503 ? 503 : 500, r.codigo);
  const fila = r.datos[0];
  if (fila?.error === DISPOSITIVO_RESERVADO) return error(409, DISPOSITIVO_RESERVADO);
  // docs/35 RV-401: la base de datos no ha conseguido el turno en 3 s (mucha gente entrando a la vez).
  // No cuenta como intento: el móvil repite pasado Retry-After.
  if (fila?.error === 'OCUPADO') return json({ error: 'OCUPADO', reintentar_en_s: 30 }, 503, { 'Retry-After': '30' });
  if (fila?.error === 'DEMASIADOS_INTENTOS') return error(429, 'DEMASIADOS_INTENTOS', { reintentar_en_s: 3600 });
  if (!fila?.token) return error(401, 'CODIGO_INCORRECTO');
  return json({ token: fila.token, caduca_en: fila.caduca_en });
}
