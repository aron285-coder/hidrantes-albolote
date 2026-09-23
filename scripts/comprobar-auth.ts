// Cómo está configurado Supabase Auth en staging y producción (docs/18 RV-36). Solo lee: el proyecto
// es también el de la app de uniformidad y su Auth no se toca desde aquí (CLAUDE.md §6).
//
//   npm run comprobar-auth
//
// Con SUPABASE_ACCESS_TOKEN lee la Management API (`/v1/projects/{ref}/config/auth`); sin él, el
// endpoint público `/auth/v1/settings` con la anon key de las variables del repositorio, que da los
// mismos tres datos. vigilancia.yml no lo ejecuta (docs/18 RV-36).
//
// El riesgo que mira: si cualquiera puede registrarse con correo y contraseña, alguien puede darse
// de alta con el correo de un administrador. Desde 0022 eso ya no da jefatura (hace falta una sesión
// de Google), pero conviene que el responsable de uniformidad lo sepa.

import { abortar, ejecutar, ejecutarScript, log } from './lib/comun.ts';
import { SupabaseGestion } from './lib/servicios.ts';
import { REFS } from './restaurar.ts';

export interface EstadoAuth {
  /** Nadie puede registrarse por su cuenta. */
  registroCerrado: boolean;
  /** El registro con correo y contraseña está activado. */
  correo: boolean;
  /** Las cuentas por correo entran sin confirmar el correo. */
  autoconfirmar: boolean;
}

/** De la Management API (`config/auth`). */
export const desdeGestion = (c: Record<string, unknown>): EstadoAuth => ({
  registroCerrado: c.disable_signup === true,
  correo: c.external_email_enabled !== false,
  autoconfirmar: c.mailer_autoconfirm === true,
});

/** Del endpoint público `/auth/v1/settings`. */
export const desdeAjustes = (s: Record<string, unknown>): EstadoAuth => ({
  registroCerrado: s.disable_signup === true,
  correo: (s.external as Record<string, unknown> | undefined)?.email !== false,
  autoconfirmar: s.mailer_autoconfirm === true,
});

/** El riesgo y qué recomendar al responsable de uniformidad. */
export function evaluar(e: EstadoAuth): { nivel: 'bajo' | 'medio' | 'alto'; texto: string } {
  if (e.registroCerrado || !e.correo) {
    return { nivel: 'bajo', texto: 'Nadie puede registrarse con correo y contraseña por su cuenta.' };
  }
  if (e.autoconfirmar) {
    return {
      nivel: 'alto',
      texto:
        'Cualquiera puede registrarse con correo y contraseña **sin confirmar el correo**: podría usar el de un administrador. Desde 0022 eso no da jefatura (hace falta una sesión de Google). Recomendación para uniformidad: exigir confirmación del correo o cerrar el registro si su app no lo necesita.',
    };
  }
  return {
    nivel: 'medio',
    texto:
      'Cualquiera puede registrarse con correo y contraseña, con confirmación por correo: el correo de confirmación llegaría al administrador, que podría pulsarlo sin darse cuenta. Desde 0022 eso no da jefatura (hace falta una sesión de Google). Recomendación para uniformidad: cerrar el registro por correo si su app no lo necesita.',
  };
}

async function leer(entorno: 'staging' | 'prod', gestion: SupabaseGestion | null): Promise<EstadoAuth> {
  if (gestion) return desdeGestion(await gestion.configAuth(REFS[entorno]));
  const sufijo = entorno === 'prod' ? 'PROD' : 'STAGING';
  const variable = (nombre: string) => {
    const r = ejecutar('gh', ['variable', 'get', nombre]);
    if (r.codigo !== 0) abortar(`No se puede leer la variable ${nombre} del repositorio (gh auth status).`);
    return r.salida.trim();
  };
  const url = variable(`SUPABASE_URL_${sufijo}`);
  const anon = variable(`SUPABASE_ANON_KEY_${sufijo}`);
  const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon } }).catch(() => null);
  if (!r?.ok) abortar(`Auth de ${entorno} respondió ${r ? r.status : 'nada'}.`);
  return desdeAjustes((await r.json()) as Record<string, unknown>);
}

async function principal(): Promise<void> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const gestion = token ? new SupabaseGestion(token) : null;
  log.paso(`Supabase Auth (${gestion ? 'Management API' : '/auth/v1/settings con la anon key'})`);
  for (const entorno of ['staging', 'prod'] as const) {
    const e = await leer(entorno, gestion);
    const { nivel, texto } = evaluar(e);
    log.info(
      `${entorno}: disable_signup=${e.registroCerrado} · email=${e.correo} · mailer_autoconfirm=${e.autoconfirmar}`,
    );
    (nivel === 'bajo' ? log.ok : log.aviso)(`${entorno} · riesgo ${nivel}: ${texto}`);
  }
}

if (import.meta.main) ejecutarScript(principal);
