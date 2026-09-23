// docs/18 RV-36 contra la pila local real: el correo de un administrador no basta para ser jefatura.
// Un usuario de Auth con contraseña (lo que permitiría un registro abierto por correo en el proyecto
// compartido con uniformidad) no es jefatura; la misma sesión con amr oauth y providers google, sí.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { claimsDe, comoGoogle, sesionConClave } from './sesion-google.ts';

const BD = process.env.BD_PRUEBAS ?? 'postgresql://postgres:postgres@127.0.0.1:55422/postgres'; // detectar-secretos:permitir (Supabase local efímero)
const RAIZ = path.resolve(import.meta.dirname, '../..');

function consulta(sql: string): string {
  return execFileSync('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', BD, '-c', sql], { encoding: 'utf8' }).trim();
}

function variables(archivo: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(path.join(RAIZ, archivo), 'utf8')
      .split('\n')
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
  );
}

test('con contraseña y el correo de un administrador no se es jefatura; con Google, sí', async ({ request }) => {
  const env = variables('.env.local');
  const api = {
    url: env.VITE_SUPABASE_URL,
    anon: env.VITE_SUPABASE_ANON_KEY,
    servicio: variables('.dev.vars').SUPABASE_SERVICE_ROLE_KEY,
  };
  const correo = `impostor.${Date.now()}@example.org`;
  consulta(`insert into hidrantes.administradores (email, creado_por) values ('${correo}', 'prueba')`);

  const esAdmin = async (jwt: string) => {
    const r = await request.post(`${api.url}/rest/v1/rpc/fn_es_admin`, {
      headers: {
        apikey: api.anon,
        Authorization: `Bearer ${jwt}`,
        'Content-Profile': 'hidrantes',
        'Accept-Profile': 'hidrantes',
      },
      data: {},
    });
    expect(r.ok()).toBe(true);
    return (await r.json()) as boolean;
  };

  const conClave = await sesionConClave(request, api, correo);
  // El formato real de una sesión local con contraseña (DEC-094): amr [{method, timestamp}] y
  // app_metadata {provider, providers}.
  const claims = claimsDe(conClave.access_token);
  console.log(
    'claims de una sesión con contraseña:',
    JSON.stringify({ amr: claims.amr, app_metadata: claims.app_metadata }),
  );
  expect(claims.amr).toEqual([expect.objectContaining({ method: 'password' })]);
  expect(claims.app_metadata).toEqual(expect.objectContaining({ provider: 'email', providers: ['email'] }));

  expect(await esAdmin(conClave.access_token)).toBe(false);
  expect(await esAdmin(comoGoogle(conClave).access_token)).toBe(true);
});
