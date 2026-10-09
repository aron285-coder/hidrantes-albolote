// Utilidades de las Pages Functions (04 §6, 05 §9). Sin dependencias: WebCrypto y fetch.
// Ninguna Function registra datos personales: los errores inesperados solo dicen qué falló.

/** Firma de un manejador de Pages Functions (solo lo que usamos del contexto). */
export type Manejador<E = Env> = (contexto: { request: Request; env: E }) => Promise<Response>;

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SAL_IP: string;
  NOMINATIM_USER_AGENT?: string;
  /**
   * `produccion` | `staging`, lo pone deploy-*.yml en cada proyecto de Pages (RV-130). Si falta, o
   * trae otra cosa, las Functions lo tratan como staging: lo seguro (RV-146).
   */
  ENTORNO?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  VIGILANCIA_SECRETO?: string;
  /** Solo para sobrescribir en local; si falta, se deduce del dominio (bucketPara). */
  BUCKET_FOTOS?: string;
  /**
   * Solo en las pruebas de integración (RV-86, DEC-120): origen de un servidor de push falso que
   * sustituye al del endpoint. /api/push lo ignora si SUPABASE_URL no es local, y
   * scripts/guarda-produccion.ts aborta si aparece en producción.
   */
  PUSH_ENDPOINT_PRUEBAS?: string;
}

/** Respuesta JSON; los errores con la forma de 05 §9: { error, mensaje }. */
/** Comparación de secretos sin atajos (el tiempo no dice cuántos caracteres coinciden). */
export function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function json(cuerpo: unknown, estado = 200, cabeceras: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cabeceras },
  });
}

export const error = (estado: number, codigo: string, extra: Record<string, unknown> = {}) =>
  json({ error: codigo, ...extra }, estado);

export async function leerJson(peticion: Request): Promise<Record<string, unknown> | null> {
  try {
    const cuerpo: unknown = await peticion.json();
    return cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? (cuerpo as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const esUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function sha256Hex(texto: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * La IP con la que cuenta el límite por IP (11 §3, RV-14). Con IPv6 un atacante rota direcciones
 * dentro de su /64, así que cuenta el /64: los cuatro primeros grupos, ya expandido `::`. Una IPv4
 * mapeada (`::ffff:a.b.c.d`) es esa IPv4, y una IPv4 queda tal cual. Lo que no parezca una IP se
 * devuelve sin tocar.
 */
export const IP_INVALIDA = 'invalida';

export function normalizarIp(ip: string): string {
  const limpia = ip.trim().toLowerCase().replace(/%.*$/, '');
  const mapeada = /^(?:(?:0{1,4}:){5}|::)ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(limpia);
  if (mapeada) return mapeada[1]!;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(limpia)) return limpia;
  if (!limpia.includes(':') || !/^[0-9a-f:]+$/.test(limpia)) return ip;
  // Con forma de IPv6 pero imposible (dos "::", más de 8 grupos, un grupo de más de 4 cifras): un
  // cubo propio que no se mezcla con ninguna IP de verdad (docs/18 RV-48).
  if (limpia.split('::').length > 2) return IP_INVALIDA;
  const [izquierda, derecha] = limpia.split('::') as [string, string?];
  const grupos = (s: string | undefined) => (s ? s.split(':') : []);
  const izq = grupos(izquierda);
  const der = grupos(derecha);
  if (izq.length + der.length > 8 || (derecha !== undefined && izq.length + der.length > 7)) return IP_INVALIDA;
  const completos =
    derecha === undefined
      ? izq
      : [...izq, ...Array<string>(Math.max(0, 8 - izq.length - der.length)).fill('0'), ...der];
  if (completos.length !== 8 || completos.some((g) => g.length > 4 || g === '')) return IP_INVALIDA;
  // IPv4 mapeada escrita en hexadecimal (::ffff:c000:201): es 192.0.2.1, no el /64 de ::1.
  const numeros = completos.map((g) => parseInt(g, 16));
  if (numeros.slice(0, 5).every((n) => n === 0) && numeros[5] === 0xffff) {
    const [a, b] = [numeros[6]!, numeros[7]!];
    return [a >> 8, a & 255, b >> 8, b & 255].join('.');
  }
  return `${completos
    .slice(0, 4)
    .map((g) => parseInt(g || '0', 16).toString(16))
    .join(':')}::/64`;
}

/** JWT de la cabecera Authorization, si la hay. */
export function jwtDe(peticion: Request): string | null {
  const a = peticion.headers.get('Authorization') ?? '';
  const m = /^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)$/.exec(a);
  return m ? m[1] : null;
}

/**
 * Bucket de fotos de este despliegue: producción solo en el dominio de producción; staging,
 * previsualizaciones y local usan el de dev (04 §4). BUCKET_FOTOS lo sobrescribe.
 */
export function bucketPara(url: string, env: Pick<Env, 'BUCKET_FOTOS'>): string {
  if (env.BUCKET_FOTOS) return env.BUCKET_FOTOS;
  return new URL(url).hostname === 'hidrantes-albolote.pages.dev' ? 'hidrantes-fotos' : 'hidrantes-fotos-dev';
}

// ---------- llamadas a la base de datos (PostgREST) ----------

/** `mensaje`: el texto de un error P0001 tras "CODIGO: ", si lo hay. No se reenvía tal cual al cliente. */
export type ResultadoRpc<T> = { ok: true; datos: T } | { ok: false; codigo: string; estado: number; mensaje?: string };

/**
 * Llama a una RPC del esquema hidrantes. Sin `jwt`, con service_role; con `jwt`, con la identidad
 * de quien llama (para que fn_es_admin() la compruebe). Los errores P0001 traen "CODIGO: texto".
 */
export async function rpc<T>(
  env: Env,
  nombre: string,
  argumentos: Record<string, unknown>,
  opciones: { jwt?: string } = {},
): Promise<ResultadoRpc<T>> {
  let r: Response;
  try {
    r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${nombre}`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${opciones.jwt ?? env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'hidrantes',
        'Accept-Profile': 'hidrantes',
      },
      body: JSON.stringify(argumentos),
    });
  } catch {
    return { ok: false, codigo: 'SERVIDOR_NO_DISPONIBLE', estado: 503 };
  }
  const texto = await r.text();
  if (r.ok) return { ok: true, datos: (texto ? JSON.parse(texto) : null) as T };
  let codigo = 'ERROR_INTERNO';
  let mensaje: string | undefined;
  try {
    const e = JSON.parse(texto) as { code?: string; message?: string };
    if (e.code === 'P0001' && e.message) {
      const dosPuntos = e.message.indexOf(':');
      codigo = (dosPuntos < 0 ? e.message : e.message.slice(0, dosPuntos)).trim();
      if (dosPuntos >= 0) mensaje = e.message.slice(dosPuntos + 1).trim() || undefined;
    } else if (e.code === '42501' || r.status === 401 || r.status === 403) codigo = 'NO_AUTORIZADO';
  } catch {
    // respuesta no JSON: se queda en ERROR_INTERNO
  }
  const estado = r.status >= 500 ? 503 : r.status;
  return mensaje === undefined ? { ok: false, codigo, estado } : { ok: false, codigo, estado, mensaje };
}

/**
 * Los números de espera de un tope, del texto de su error: `maximo=N reintentar_en_s=S` (05 §6, como
 * CUOTA_PROPUESTAS_AGOTADA desde 0039). Solo los números: el texto no se reenvía al cliente.
 */
export function detalleTope(mensaje: string | undefined): { maximo?: number; reintentar_en_s?: number } {
  const detalle: { maximo?: number; reintentar_en_s?: number } = {};
  const maximo = /\bmaximo=(\d+)/.exec(mensaje ?? '');
  const segundos = /\breintentar_en_s=(\d+)/.exec(mensaje ?? '');
  if (maximo) detalle.maximo = Number(maximo[1]);
  if (segundos) detalle.reintentar_en_s = Number(segundos[1]);
  return detalle;
}

/** ¿El JWT es de un administrador activo? (FR-37). La comprobación la hace la base de datos. */
export async function esAdmin(env: Env, jwt: string | null): Promise<boolean> {
  if (!jwt) return false;
  const r = await rpc<boolean>(env, 'fn_es_admin', {}, { jwt });
  return r.ok && r.datos === true;
}

/**
 * ¿El token de dispositivo de un voluntario vale? Lo comprueba fn_validar_token, concedida a
 * service_role en 0043 (#561): antes se usaba fn_listar_puntos, que service_role no puede ejecutar,
 * y el permiso denegado se leía como token no válido (401 a todos los voluntarios).
 *
 * - `valido`: el token vale.
 * - `invalido`: la base de datos lo rechaza (TOKEN_INVALIDO, TOKEN_REVOCADO, TOKEN_CADUCADO).
 * - `sin_servidor`: cualquier otro fallo (red, permisos, error interno). No es culpa del voluntario:
 *   la Function contesta 503 y el fallo queda anotado en errores_cliente con `ruta`, sin el token.
 */
export async function validarToken(
  env: Env,
  token: string,
  ruta: string,
): Promise<'valido' | 'invalido' | 'sin_servidor'> {
  const r = await rpc<string>(env, 'fn_validar_token', { token });
  if (r.ok) return 'valido';
  if (r.codigo.startsWith('TOKEN_')) return 'invalido';
  // Firma de seis argumentos con service_role (0040), con su propio cupo por ip_hash fijo, como
  // /api/direccion. Si tampoco esto llega, la respuesta 503 ya dice que el fallo es del servidor.
  await rpc(env, 'fn_registrar_error', {
    dispositivo_id: null,
    mensaje: `validar_token_fallo: ${r.codigo}`,
    pila: null,
    ruta,
    agente: null,
    ip_hash: 'funcion:validar_token',
  });
  return 'sin_servidor';
}

/** Estado HTTP de cada código de error de 05 §8 que puede llegar a una Function. */
export function estadoDe(codigo: string): number {
  if (codigo.startsWith('TOKEN_') || codigo === 'CODIGO_INCORRECTO') return 401;
  if (codigo === 'NO_AUTORIZADO') return 403;
  if (codigo.startsWith('CUOTA_') || codigo === 'DEMASIADOS_INTENTOS') return 429;
  // Topes de 0041 (docs/32 RV-220, RV-221): esperas, como las cuotas. Nunca 5xx, que el móvil lee
  // como "sin servidor" y pierde el código.
  if (codigo === 'SIN_ESPACIO_FOTOS' || codigo === 'RESERVAS_ABIERTAS' || codigo === 'SIN_ESPACIO') return 429;
  if (codigo === 'SERVIDOR_NO_DISPONIBLE') return 503;
  if (codigo === 'ERROR_INTERNO') return 500;
  return 400;
}

export const esperar = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
