// POST /api/vincular-jefatura (05 §9, docs/35 RV-400, DEC-197). Une la fila de `administradores` al
// usuario de Supabase Auth de quien entra en el panel con Google, la primera vez.
//
// El correo que cuenta es el de su **identidad de Google** (`identities[].identity_data.email`,
// verificado), el que da Google; nunca `user.email`. El usuario lo lee Supabase Auth con el JWT de
// la sesión (`GET /auth/v1/user`), que así queda validado.
// La base de datos decide con fn_vincular_administrador (solo service_role).
//
// Nunca registra ni devuelve el correo ni el id del usuario (11 §6).

import { type Env, type Manejador, error, json, jwtDe, normalizarIp, rpc } from '../_lib/comun.ts';
import { dentroDelLimite } from '../_lib/limite.ts';

export const RESULTADOS_BUENOS = ['VINCULADO', 'YA_VINCULADO'] as const;
export const RESULTADOS_SIN_ACCESO = ['NO_ES_ADMINISTRADOR', 'OTRA_CUENTA'] as const;
type Resultado = (typeof RESULTADOS_BUENOS)[number] | (typeof RESULTADOS_SIN_ACCESO)[number];

interface Identidad {
  provider?: unknown;
  identity_data?: { email?: unknown; email_verified?: unknown } | null;
}
interface UsuarioAuth {
  id?: unknown;
  identities?: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * El correo verificado de la identidad de Google del usuario, en minúsculas, o null si no tiene.
 * `email_verified` tiene que ser `true` de verdad: ni `"true"` ni ausente.
 */
export function correoDeGoogle(usuario: UsuarioAuth): string | null {
  if (!Array.isArray(usuario.identities)) return null;
  for (const i of usuario.identities as Identidad[]) {
    if (i?.provider !== 'google') continue;
    const datos = i.identity_data;
    if (datos?.email_verified !== true || typeof datos.email !== 'string') continue;
    const correo = datos.email.trim().toLowerCase();
    if (correo.includes('@')) return correo;
  }
  return null;
}

/** El usuario de Supabase Auth de ese JWT; null si Auth no lo acepta; 'sin_servidor' si no responde. */
async function leerUsuario(env: Env, jwt: string): Promise<UsuarioAuth | null | 'sin_servidor'> {
  let r: Response;
  try {
    r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${jwt}` },
    });
  } catch {
    return 'sin_servidor';
  }
  if (r.status >= 500) return 'sin_servidor';
  if (!r.ok) return null;
  const usuario = (await r.json().catch(() => null)) as UsuarioAuth | null;
  return usuario && typeof usuario === 'object' ? usuario : null;
}

export const onRequestPost: Manejador = async ({ request, env }) => {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'desconocida';
  if (!dentroDelLimite(`vincular:${normalizarIp(ip)}`)) return error(429, 'DEMASIADOS_INTENTOS');

  const jwt = jwtDe(request);
  if (!jwt) return error(401, 'NO_AUTORIZADO');
  const usuario = await leerUsuario(env, jwt);
  if (usuario === 'sin_servidor') return error(503, 'SERVIDOR_NO_DISPONIBLE');
  if (!usuario || typeof usuario.id !== 'string' || !UUID.test(usuario.id)) return error(401, 'NO_AUTORIZADO');

  const correo = correoDeGoogle(usuario);
  if (!correo) return error(403, 'SIN_GOOGLE');

  const r = await rpc<string>(env, 'fn_vincular_administrador', { usuario: usuario.id, correo });
  if (!r.ok) {
    // Solo el código: ni el correo ni el usuario (11 §6).
    console.error(`vincular-jefatura: fn_vincular_administrador ${r.codigo}`);
    return error(r.estado === 503 ? 503 : 500, r.estado === 503 ? 'SERVIDOR_NO_DISPONIBLE' : 'ERROR_INTERNO');
  }
  const resultado = r.datos as Resultado;
  if ((RESULTADOS_BUENOS as readonly string[]).includes(resultado)) return json({ resultado });
  if ((RESULTADOS_SIN_ACCESO as readonly string[]).includes(resultado)) return error(403, resultado);
  console.error('vincular-jefatura: respuesta inesperada de fn_vincular_administrador');
  return error(500, 'ERROR_INTERNO');
};
