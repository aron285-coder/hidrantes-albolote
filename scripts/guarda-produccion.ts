// Guarda de deploy-prod.yml (04 §4): aborta si algo apunta a un proyecto que no es producción,
// si la conexión no usa el rol hidrantes_migrador, si el flujo menciona el seed de staging, o si el
// servidor de push falso de las pruebas (PUSH_ENDPOINT_PRUEBAS, RV-86, DEC-120) asoma por algún lado.
// docs/31 RV-136: también el frontend. VITE_SUPABASE_URL y la anon key (el ref va dentro del JWT) son
// del proyecto de producción; si no, producción serviría una app que habla con otra base de datos.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, abortar, ejecutarScript, log } from './lib/comun.ts';

export interface EntradaGuarda {
  entorno?: string;
  proyectoPages?: string;
  ref?: string;
  supabaseUrl?: string;
  dbUrl?: string;
  /** VITE_SUPABASE_URL con la que se construye el frontend. */
  viteSupabaseUrl?: string;
  /** VITE_SUPABASE_ANON_KEY: un JWT con `ref` y `role` en su carga. */
  anonKey?: string;
  flujo: string;
  /** Valor de PUSH_ENDPOINT_PRUEBAS en el entorno del despliegue: tiene que faltar. */
  pushEndpointPruebas?: string;
  /** scripts/arranque.ts, que es quien sube los secretos de Pages: no puede subir esa variable. */
  arranque?: string;
  /** Nombres de las variables de production del proyecto de Pages; null si no se han podido leer. */
  variablesPages: readonly string[] | null;
}

const PUSH_PRUEBAS = 'PUSH_ENDPOINT_PRUEBAS';

/** El host de una URL, o null si falta o no es una URL. */
function host(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** La carga de un JWT, sin verificar la firma (solo se mira de qué proyecto dice ser), o null. */
export function cargaJwt(token: string | undefined): Record<string, unknown> | null {
  const partes = token?.trim().split('.');
  if (partes?.length !== 3) return null;
  try {
    const carga: unknown = JSON.parse(Buffer.from(partes[1]!, 'base64url').toString('utf8'));
    return carga && typeof carga === 'object' ? (carga as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Devuelve la lista de problemas; vacía si se puede desplegar. */
export function comprobarGuarda(e: EntradaGuarda): string[] {
  const p: string[] = [];
  if (e.entorno !== 'produccion') p.push('VITE_ENTORNO no es "produccion"');
  if (e.proyectoPages !== 'hidrantes-albolote') p.push('PAGES_PROYECTO no es "hidrantes-albolote"');
  if (!e.ref || !/^[a-z0-9]{20}$/.test(e.ref)) p.push('SUPABASE_PROJECT_REF falta o no tiene forma de ref');
  else {
    if (host(e.supabaseUrl) !== `${e.ref}.supabase.co`) {
      p.push('SUPABASE_URL no es el proyecto de SUPABASE_PROJECT_REF');
    }
    if (host(e.viteSupabaseUrl) !== `${e.ref}.supabase.co`) {
      p.push('VITE_SUPABASE_URL no es el proyecto de SUPABASE_PROJECT_REF (RV-136)');
    }
    // arranque.ts guarda la clave publishable (sb_publishable_…) si el proyecto ya no tiene la anon
    // antigua (scripts/lib/servicios.ts, elegirClaves). No lleva el ref dentro: basta con la URL.
    // Una sb_secret_ en el frontend sería la clave de servicio a la vista de todos.
    const clave = e.anonKey?.trim() ?? '';
    const carga = cargaJwt(clave);
    if (clave.startsWith('sb_secret_'))
      p.push('VITE_SUPABASE_ANON_KEY es una clave secreta: nunca en el frontend (RV-136)');
    else if (/^sb_publishable_[\w-]+$/.test(clave)) {
      // Sin ref dentro: la comprobación de VITE_SUPABASE_URL es la que vale.
    } else if (!carga) p.push('VITE_SUPABASE_ANON_KEY falta o no es un JWT ni una clave publishable (RV-136)');
    else {
      if (carga.ref !== e.ref) p.push('VITE_SUPABASE_ANON_KEY es de otro proyecto (RV-136)');
      if (carga.role !== 'anon') p.push('VITE_SUPABASE_ANON_KEY no es la clave anon (RV-136)');
    }
    if (!e.dbUrl || decodeURIComponent(new URL(e.dbUrl).username) !== `hidrantes_migrador.${e.ref}`) {
      p.push('SUPABASE_DB_URL no usa hidrantes_migrador en ese proyecto (DEC-052)');
    }
  }
  const lineas = e.flujo.split('\n').filter((l) => !l.trim().startsWith('#'));
  if (lineas.some((l) => l.includes('seed-staging') || l.includes('[PRUEBA]'))) {
    p.push('deploy-prod.yml menciona el seed de staging');
  }
  if (e.pushEndpointPruebas) p.push('PUSH_ENDPOINT_PRUEBAS está definida: es solo de las pruebas locales (RV-86)');
  if (lineas.some((l) => l.includes(PUSH_PRUEBAS))) p.push('deploy-prod.yml menciona PUSH_ENDPOINT_PRUEBAS');
  if (e.arranque?.includes(PUSH_PRUEBAS))
    p.push('scripts/arranque.ts menciona PUSH_ENDPOINT_PRUEBAS (subiría a Pages)');
  // Las variables que las Functions necesitan para funcionar. Sin SAL_IP, /api/verificar-codigo y
  // /api/error responden 503 NO_CONFIGURADO: nadie podría entrar con el código (docs/31, #484).
  if (e.variablesPages === null) {
    p.push('no se pueden leer las variables del proyecto de Pages (¿CLOUDFLARE_API_TOKEN?)');
  } else {
    for (const v of VARIABLES_PAGES) {
      if (!e.variablesPages.includes(v))
        p.push(`al proyecto de Pages le falta ${v}: npm run arranque -- --solo-faltantes`);
    }
  }
  return p;
}

/** Lo que las Functions de producción no pueden no tener (functions/_lib/comun.ts, Env). */
export const VARIABLES_PAGES = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SAL_IP'] as const;

/**
 * Los **nombres** de las variables de production del proyecto de Pages (nunca los valores: los
 * secretos no los devuelve la API). null si no se pueden leer: la guarda lo trata como un problema.
 */
export async function variablesDePages(
  proyecto: string,
  cuenta: string | undefined,
  token: string | undefined,
  f: typeof fetch = fetch,
): Promise<string[] | null> {
  if (!cuenta || !token) return null;
  const r = await f(`https://api.cloudflare.com/client/v4/accounts/${cuenta}/pages/projects/${proyecto}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json().catch(() => null)) as {
    result?: { deployment_configs?: { production?: { env_vars?: Record<string, unknown> | null } } };
  } | null;
  const vars = j?.result?.deployment_configs?.production?.env_vars;
  if (!vars || typeof vars !== 'object') return null;
  return Object.keys(vars).sort();
}

async function principal(): Promise<void> {
  const problemas = comprobarGuarda({
    entorno: process.env.VITE_ENTORNO,
    proyectoPages: process.env.PAGES_PROYECTO,
    ref: process.env.SUPABASE_PROJECT_REF,
    supabaseUrl: process.env.SUPABASE_URL,
    dbUrl: process.env.SUPABASE_DB_URL,
    viteSupabaseUrl: process.env.VITE_SUPABASE_URL,
    anonKey: process.env.VITE_SUPABASE_ANON_KEY,
    flujo: readFileSync(path.join(RAIZ, '.github', 'workflows', 'deploy-prod.yml'), 'utf8'),
    pushEndpointPruebas: process.env.PUSH_ENDPOINT_PRUEBAS,
    arranque: readFileSync(path.join(RAIZ, 'scripts', 'arranque.ts'), 'utf8'),
    variablesPages: await variablesDePages(
      'hidrantes-albolote',
      process.env.CLOUDFLARE_ACCOUNT_ID,
      process.env.CLOUDFLARE_API_TOKEN,
    ),
  });
  if (problemas.length) abortar(`Guarda de producción:\n  - ${problemas.join('\n  - ')}`);
  log.ok('Guarda de producción superada');
}

if (import.meta.main) ejecutarScript(principal);
