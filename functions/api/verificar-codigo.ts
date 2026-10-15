// POST /api/verificar-codigo (05 §9, 11 §3): canje del código de acceso por un token de dispositivo.
// Es la única capa que ve la IP real (CF-Connecting-IP) y la guarda como sha256(SAL_IP + ip), con la
// IP normalizada: en IPv6 cuenta el /48 (RV-14, docs/35 RV-401). Solo peticiones de la propia app, y
// como mucho LIMITE_CODIGO_POR_MINUTO por IP agrupada (docs/36 RV-451), o LIMITE_CODIGO_ENTRADA_ABIERTA
// con la entrada abierta (docs/37 RV-491).

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
/**
 * docs/37 RV-491 (DEC-211, 03 TR-41): con la entrada abierta (fn_entrada_abierta_hasta, el día del
 * lanzamiento), 60 por minuto y por IP agrupada: una sala entera entra desde la misma wifi. Los topes de
 * la base de datos no cambian aquí (con la entrada abierta, fn_verificar_codigo ya sube los de altas).
 */
export const LIMITE_CODIGO_ENTRADA_ABIERTA = 60;
const topeCodigo = crearTope(LIMITE_CODIGO_POR_MINUTO, 60_000);

/** Cada cuánto, como mucho, se pregunta a la base de datos si la entrada está abierta (por aislado). */
export const CONSULTA_ENTRADA_MS = 60_000;

/** Lo último que se supo de la entrada: hasta cuándo está abierta (null: cerrada) y cuándo se preguntó. */
let entrada: { hasta: number | null; preguntadaEn: number } | null = null;
let preguntando: Promise<number | null> | null = null;

/** Solo para los tests: olvida lo que se sabía de la entrada. */
export function _reiniciarEntrada(): void {
  entrada = null;
  preguntando = null;
}

/**
 * ¿Está abierta la entrada ahora? Pregunta con la service role como mucho una vez por minuto; las
 * peticiones que llegan mientras se pregunta esperan esa misma respuesta. Si la pregunta falla, se
 * recuerda como cerrada ese minuto: se sigue con el tope normal sin preguntar en cada intento.
 */
async function entradaAbierta(env: Env, ahora: number): Promise<boolean> {
  if (!entrada || ahora - entrada.preguntadaEn >= CONSULTA_ENTRADA_MS) {
    preguntando ??= rpc<unknown>(env, 'fn_entrada_abierta_hasta', {})
      .then((r) => {
        const hasta = r.ok && typeof r.datos === 'string' ? Date.parse(r.datos) : NaN;
        return Number.isFinite(hasta) ? hasta : null;
      })
      .catch(() => null)
      .then((hasta) => {
        entrada = { hasta, preguntadaEn: ahora };
        preguntando = null;
        return hasta;
      });
    await preguntando;
  }
  return entrada?.hasta != null && entrada.hasta > ahora;
}

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
  // docs/37 RV-491: solo se pregunta por la entrada cuando una IP pasa de las 10; con ella abierta,
  // caben 60.
  const ip = normalizarIp(request.headers.get('CF-Connecting-IP') ?? 'desconocida');
  const ahora = Date.now();
  let espera = topeCodigo.pedir(`codigo:${ip}`, ahora);
  if (espera !== null && (await entradaAbierta(env, ahora))) {
    espera = topeCodigo.pedir(`codigo:${ip}`, ahora, LIMITE_CODIGO_ENTRADA_ABIERTA);
  }
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
