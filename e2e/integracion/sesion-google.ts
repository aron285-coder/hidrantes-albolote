// Una sesión de jefatura contra el Supabase local (docs/18 RV-36). Jefatura exige una sesión de
// Google (amr oauth y app_metadata.providers con google), y el Supabase local no tiene Google. Se
// crea el usuario, se entra con contraseña y se vuelve a firmar el mismo access_token con el
// secreto JWT **local** cambiando solo esos dos claims: el session_id y el resto siguen siendo los de
// una sesión real, así que Auth y PostgREST la aceptan. Solo vale contra la pila local.

import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';

export interface Sesion {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string; email: string; app_metadata: Record<string, unknown> } & Record<string, unknown>;
  [clave: string]: unknown;
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const leer = (parte: string) => JSON.parse(Buffer.from(parte, 'base64url').toString('utf8')) as Record<string, unknown>;

/** El secreto JWT del Supabase local, de `supabase status`. */
function secretoLocal(): string {
  const salida = execFileSync('npx', ['--no-install', 'supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const s = JSON.parse(salida.slice(salida.indexOf('{'))) as Record<string, string>;
  if (!s.API_URL?.includes('127.0.0.1') || !s.JWT_SECRET) throw new Error('Solo contra el Supabase local.');
  return s.JWT_SECRET;
}

/** Los claims de un token, sin comprobar la firma (para ver el formato real de amr). */
export const claimsDe = (jwt: string) => leer(jwt.split('.')[1]);

/** Vuelve a firmar el token como el de una sesión de Google: amr oauth y providers google. */
export function comoGoogle(sesion: Sesion, secreto = secretoLocal()): Sesion {
  // El Supabase local firma sus sesiones con ES256, pero Auth y PostgREST siguen aceptando HS256 con
  // el secreto JWT (así van firmadas la anon key y la service key): se vuelve a firmar en HS256.
  const cab = { alg: 'HS256', typ: 'JWT' };
  const claims = leer(sesion.access_token.split('.')[1]);
  const iat = typeof claims.iat === 'number' ? claims.iat : Math.floor(Date.now() / 1000);
  const appMetadata = { ...(claims.app_metadata as object), provider: 'google', providers: ['google'] };
  const nuevos = { ...claims, amr: [{ method: 'oauth', timestamp: iat }], app_metadata: appMetadata };
  const firmado = `${b64(cab)}.${b64(nuevos)}`;
  const firma = createHmac('sha256', secreto).update(firmado).digest('base64url');
  return {
    ...sesion,
    access_token: `${firmado}.${firma}`,
    user: { ...sesion.user, app_metadata: appMetadata },
  };
}

/** Usuario nuevo de Auth con contraseña y su sesión, tal cual la da el Supabase local. */
export async function sesionConClave(
  request: APIRequestContext,
  api: { url: string; anon: string; servicio: string },
  correo: string,
): Promise<Sesion> {
  const clave = `clave-${Date.now()}`; // detectar-secretos:permitir (usuario efímero del Supabase local)
  const alta = await request.post(`${api.url}/auth/v1/admin/users`, {
    headers: { apikey: api.servicio, Authorization: `Bearer ${api.servicio}` },
    data: { email: correo, password: clave, email_confirm: true },
  });
  if (!alta.ok()) throw new Error(`No se ha podido crear el usuario: ${alta.status()}`);
  const r = await request.post(`${api.url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: api.anon },
    data: { email: correo, password: clave },
  });
  const sesion = (await r.json()) as Sesion;
  if (!sesion.access_token) throw new Error('Sin access_token al entrar con contraseña.');
  return sesion;
}

/** La sesión de un administrador tal como la tendría tras entrar con Google. */
export async function sesionDeJefatura(
  request: APIRequestContext,
  api: { url: string; anon: string; servicio: string },
  correo: string,
): Promise<Sesion> {
  return comoGoogle(await sesionConClave(request, api, correo));
}
