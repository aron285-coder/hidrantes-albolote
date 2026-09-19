// Ayudas de los e2e: sesión guardada y un Supabase simulado con page.route.

import type { Page, Route } from '@playwright/test';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';

export const TOKEN = 'a'.repeat(43);
export const FIRMA = { nombre: 'Voluntaria', apellido: 'Pruebas' };

/** Deja el móvil como si ya hubiera entrado (y visto o no las pantallas de primer uso). */
export async function conSesion(page: Page, { primerUsoVisto = true, extra = {} as Record<string, unknown> } = {}) {
  await page.addInitScript(
    ([token, firma, visto, otros]) => {
      if (sessionStorage.getItem('sembrado')) return;
      sessionStorage.setItem('sembrado', '1');
      localStorage.setItem('hidrantes.token', JSON.stringify(token));
      localStorage.setItem('hidrantes.firma', JSON.stringify(firma));
      if (visto) localStorage.setItem('hidrantes.primer_uso_visto', 'true');
      for (const [k, v] of Object.entries(otros)) localStorage.setItem(`hidrantes.${k}`, JSON.stringify(v));
    },
    [TOKEN, FIRMA, primerUsoVisto, extra] as const,
  );
}

const json = (route: Route, cuerpo: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) });

/** RPC simuladas: nombre → respuesta. Lo no listado responde como un servidor caído. */
export async function simularRpc(page: Page, respuestas: Record<string, unknown>) {
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/*`, (route) => {
    const nombre = new URL(route.request().url()).pathname.split('/').pop()!;
    if (nombre in respuestas) return json(route, respuestas[nombre]);
    return route.abort('connectionrefused');
  });
}

/** Sesión de Google guardada (jefatura), sin pasar por Google: supabase-js la lee del almacén. */
export async function conGoogle(page: Page, correo: string) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const expira = Math.floor(Date.now() / 1000) + 3600;
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', email: correo, role: 'authenticated', exp: expira })}.firma`;
  const sesion = {
    access_token: jwt,
    refresh_token: 'refresco',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expira,
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: correo, app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem('google')) {
      sessionStorage.setItem('google', '1');
      localStorage.setItem('hidrantes.auth', s);
    }
  }, JSON.stringify(sesion));
  await page.route(`${SUPABASE_PRUEBAS}/auth/v1/**`, (route) => route.fulfill({ status: 204, body: '' }));
}
