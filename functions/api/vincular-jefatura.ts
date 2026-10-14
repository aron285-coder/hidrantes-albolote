// POST /api/vincular-jefatura (05 §9, docs/35 RV-400, DEC-197). Une la fila de `administradores` al
// usuario de Supabase Auth de quien entra en el panel con Google, la primera vez.
//
// El correo que cuenta es el de su **identidad de Google** (`identities[].identity_data.email`,
// verificado), el que da Google. El usuario lo lee Supabase Auth con el JWT de la sesión
// (`GET /auth/v1/user`), que así queda validado.
// docs/36 RV-450 (DEC-206): solo se une una cuenta «limpia»: **todas** sus identidades llevan ese mismo
// correo, verificado, y `user.email` también es ese. Si no, 403 CUENTA_MEZCLADA.
// La base de datos decide con fn_vincular_administrador (solo service_role). Con VINCULADO o
// YA_VINCULADO se cierran las demás sesiones de ese usuario (`logout?scope=others`); si no se puede,
// la unión se deshace con fn_desvincular_administrador y 503.
//
// Solo «sin acceso» (401 NO_AUTORIZADO, 403 SIN_GOOGLE / CUENTA_MEZCLADA / NO_ES_ADMINISTRADOR /
// OTRA_CUENTA) dice que esa cuenta no es jefatura. Un fallo nuestro o de Auth es 503 o 500, y queda
// anotado en errores_cliente con un ip_hash fijo, como validarToken: solo códigos y estados, nunca el
// correo ni el id del usuario (11 §6).

import {
  type Env,
  type Manejador,
  type ResultadoRpc,
  error,
  exigirMismoOrigen,
  json,
  jwtDe,
  normalizarIp,
  rpc,
} from '../_lib/comun.ts';
import { dentroDelLimite } from '../_lib/limite.ts';

export const RESULTADOS_BUENOS = ['VINCULADO', 'YA_VINCULADO'] as const;
export const RESULTADOS_SIN_ACCESO = ['NO_ES_ADMINISTRADOR', 'OTRA_CUENTA'] as const;
type Resultado = (typeof RESULTADOS_BUENOS)[number] | (typeof RESULTADOS_SIN_ACCESO)[number];

const RUTA = '/api/vincular-jefatura';

interface Identidad {
  provider?: unknown;
  identity_data?: { email?: unknown; email_verified?: unknown } | null;
}
interface UsuarioAuth {
  id?: unknown;
  email?: unknown;
  identities?: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * El correo verificado de la identidad de Google del usuario, en minúsculas, o null si no tiene.
 * `email_verified` tiene que ser `true` de verdad: ni `"true"` ni ausente.
 */
export function correoDeGoogle(usuario: UsuarioAuth): string | null {
  for (const i of identidadesDeGoogle(usuario)) {
    const datos = i.identity_data;
    if (datos?.email_verified !== true || typeof datos.email !== 'string') continue;
    const correo = datos.email.trim().toLowerCase();
    if (correo.includes('@')) return correo;
  }
  return null;
}

function identidadesDeGoogle(usuario: UsuarioAuth): Identidad[] {
  if (!Array.isArray(usuario.identities)) return [];
  return (usuario.identities as (Identidad | null)[]).filter((i): i is Identidad => i?.provider === 'google');
}

const normalizar = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : null);

/** El proveedor de una identidad, solo si es uno conocido: lo que se anota no lleva nada más. */
const PROVEEDORES = ['google', 'email', 'phone', 'github', 'apple', 'azure', 'facebook', 'twitter', 'gitlab'];
const proveedor = (i: Identidad | null) =>
  typeof i?.provider === 'string' && PROVEEDORES.includes(i.provider) ? i.provider : 'otro';

/**
 * docs/36 RV-450 (DEC-206): ¿es una cuenta de una sola persona? Todas sus identidades, sean del
 * proveedor que sean, llevan `correo` verificado (`email_verified === true`), y el correo de la cuenta
 * también es `correo`. Una cuenta de uniformidad con correo y contraseña y el mismo correo pasa.
 *
 * Devuelve null si lo es, o qué regla no cumple, para anotarlo: un código fijo y, como mucho, el
 * proveedor de la identidad. Nunca un correo ni un id. Así se distingue una cuenta mezclada de un
 * cambio de forma de Supabase Auth (por ejemplo, identidades sin `email_verified`).
 */
export function motivoDeMezcla(usuario: UsuarioAuth, correo: string): string | null {
  if (normalizar(usuario.email) !== correo) return 'correo de la cuenta distinto';
  if (!Array.isArray(usuario.identities) || usuario.identities.length === 0) return 'sin identidades';
  for (const i of usuario.identities as (Identidad | null)[]) {
    const datos = i?.identity_data;
    if (normalizar(datos?.email) !== correo) return `identidad ${proveedor(i)} con otro correo`;
    if (datos?.email_verified !== true) return `identidad ${proveedor(i)} sin verificar`;
  }
  return null;
}

export const cuentaSinMezcla = (usuario: UsuarioAuth, correo: string) => motivoDeMezcla(usuario, correo) === null;

/**
 * Deja constancia de un fallo en errores_cliente (la firma de seis argumentos, de service_role, con
 * su propio cupo por ip_hash fijo). Si tampoco eso llega, al menos en el registro del Worker.
 * `cupo`: las cuentas mezcladas van aparte, para que muchas no agoten el cupo de los fallos de verdad.
 */
async function anotar(env: Env, motivo: string, cupo = 'funcion:vincular_jefatura'): Promise<void> {
  const mensaje = `vincular_jefatura: ${motivo}`;
  let anotado = false;
  try {
    const r = await rpc(env, 'fn_registrar_error', {
      dispositivo_id: null,
      mensaje,
      pila: null,
      ruta: RUTA,
      agente: null,
      ip_hash: cupo,
    });
    anotado = r.ok;
  } catch {
    // se queda sin anotar: lo dice el console.error de abajo
  }
  if (!anotado) console.error(`${mensaje} (sin anotar)`);
}

type Lectura = { usuario: UsuarioAuth } | { rechazado: true } | { fallo: string };

/** El usuario de Supabase Auth de ese JWT. Solo 401 y 403 son «no es una sesión válida». */
async function leerUsuario(env: Env, jwt: string): Promise<Lectura> {
  let r: Response;
  try {
    r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${jwt}` },
    });
  } catch {
    return { fallo: 'auth red' };
  }
  if (r.status === 401 || r.status === 403) return { rechazado: true };
  if (!r.ok) return { fallo: `auth ${r.status}` };
  const usuario: unknown = await r.json().catch(() => null);
  if (!usuario || typeof usuario !== 'object' || Array.isArray(usuario)) return { fallo: 'auth respuesta no JSON' };
  return { usuario: usuario as UsuarioAuth };
}

/** Deshace la unión. Devuelve null si se ha deshecho, o por qué no. */
async function desunir(env: Env, correo: string): Promise<string | null> {
  let r: ResultadoRpc<unknown>;
  try {
    r = await rpc<unknown>(env, 'fn_desvincular_administrador', { correo });
  } catch {
    return 'rpc respuesta no JSON';
  }
  if (!r.ok) return `rpc ${r.codigo} ${r.estado}`;
  // Justo después de unirla, «no estaba unida» no debería pasar: se anota igual.
  return r.datos === true ? null : 'no estaba unida';
}

/**
 * docs/36 RV-450: con la fila unida, cierra las demás sesiones de ese usuario (también las de la app
 * de uniformidad, si es el mismo usuario). Si no se puede, deshace la unión (un reintento): no se
 * queda una cuenta de jefatura con otras sesiones vivas. Devuelve si el cierre ha ido bien.
 */
async function cerrarOtrasSesiones(env: Env, jwt: string, correo: string): Promise<boolean> {
  let motivo: string;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/logout?scope=others`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${jwt}` },
    });
    if (r.ok) return true;
    motivo = String(r.status);
  } catch {
    motivo = 'red';
  }
  await anotar(env, `cierre de sesiones ${motivo}`);
  const fallo = (await desunir(env, correo)) && (await desunir(env, correo));
  // Queda unida sin haber cerrado las demás sesiones. La próxima entrada al panel vuelve a pasar por
  // aquí (YA_VINCULADO también cierra), y la revisión diaria de las uniones (RV-463) la ve.
  if (fallo) await anotar(env, `unión sin deshacer, ${fallo}`);
  return false;
}

export const onRequestPost: Manejador = async ({ request, env }) => {
  // Solo peticiones de la propia app (docs/35 RV-401), antes que el tope por IP.
  const ajena = exigirMismoOrigen(request);
  if (ajena) return ajena;
  const ip = request.headers.get('CF-Connecting-IP') ?? 'desconocida';
  if (!dentroDelLimite(`vincular:${normalizarIp(ip)}`)) return error(429, 'DEMASIADOS_INTENTOS');

  const jwt = jwtDe(request);
  if (!jwt) return error(401, 'NO_AUTORIZADO');

  const lectura = await leerUsuario(env, jwt);
  if ('rechazado' in lectura) return error(401, 'NO_AUTORIZADO');
  if ('fallo' in lectura) {
    await anotar(env, lectura.fallo);
    return error(503, 'SERVIDOR_NO_DISPONIBLE');
  }
  const { usuario } = lectura;
  if (typeof usuario.id !== 'string' || !UUID.test(usuario.id)) {
    await anotar(env, 'auth usuario sin id');
    return error(500, 'ERROR_INTERNO');
  }

  const correo = correoDeGoogle(usuario);
  if (!correo) {
    // Con una identidad de Google que no pasa el filtro, se anota (sin el correo): puede ser un cambio
    // de forma de Supabase Auth, no una cuenta ajena.
    if (identidadesDeGoogle(usuario).length > 0) await anotar(env, 'identidad de Google sin correo verificado');
    return error(403, 'SIN_GOOGLE');
  }
  // docs/36 RV-450: una cuenta con otra identidad unida no se une a jefatura.
  const mezcla = motivoDeMezcla(usuario, correo);
  if (mezcla) {
    await anotar(env, `cuenta con otra identidad (${mezcla})`, 'funcion:vincular_jefatura:cuenta');
    return error(403, 'CUENTA_MEZCLADA');
  }

  let r: ResultadoRpc<unknown>;
  try {
    r = await rpc<unknown>(env, 'fn_vincular_administrador', { usuario: usuario.id, correo });
  } catch {
    // El ayudante de comun.ts no captura un 200 con un cuerpo que no es JSON.
    await anotar(env, 'rpc respuesta no JSON');
    return error(500, 'ERROR_INTERNO');
  }
  if (!r.ok) {
    await anotar(env, `rpc ${r.codigo} ${r.estado}`);
    return r.estado === 503 ? error(503, 'SERVIDOR_NO_DISPONIBLE') : error(500, 'ERROR_INTERNO');
  }
  const resultado = r.datos as Resultado;
  // También con YA_VINCULADO: el panel solo llama aquí si fn_es_admin le ha dicho que no, así que una
  // unión anterior cuyo cierre falló se cierra ahora (y si vuelve a fallar, se deshace).
  if ((RESULTADOS_BUENOS as readonly unknown[]).includes(resultado) && !(await cerrarOtrasSesiones(env, jwt, correo))) {
    return error(503, 'SERVIDOR_NO_DISPONIBLE');
  }
  if ((RESULTADOS_BUENOS as readonly unknown[]).includes(resultado)) return json({ resultado });
  if ((RESULTADOS_SIN_ACCESO as readonly unknown[]).includes(resultado)) return error(403, resultado);
  await anotar(env, 'rpc resultado inesperado');
  return error(500, 'ERROR_INTERNO');
};
