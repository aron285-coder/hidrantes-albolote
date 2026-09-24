// ¿Tiene producción todo lo que la versión actual necesita? (docs/19 P-01, DEC-096). Solo lectura:
// no cambia nada y **nunca imprime valores**, solo nombres (DEC-053).
//
//   npm run comprobar-produccion           en local: GitHub (gh), Pages (wrangler), Data API, y lo
//                                          demás si están SUPABASE_DB_URL_PROD, CLOUDFLARE_API_TOKEN,
//                                          CLOUDFLARE_ACCOUNT_ID y SUPABASE_ACCESS_TOKEN
//   comprobar-produccion.yml               en Actions: la base de datos y el token de Cloudflare,
//                                          con los secretos que en local no hay
//
// Cada comprobación que no se puede hacer con lo que hay sale como NO COMPROBADO, nunca como OK.
// Termina con 1 si falta algo imprescindible para desplegar.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, ejecutar, ejecutarScript, log, psql } from './lib/comun.ts';
import { type Migracion, leerMigraciones } from './migrar.ts';

const REPO = 'aron285-coder/hidrantes-albolote';
const PAGES_PROD = 'hidrantes-albolote';

// ---------- lo que tiene que haber ----------

/** Secretos y variables que `deploy-prod.yml` usa, leídos del propio workflow. */
export function requeridosDeWorkflow(yml: string): { secretos: string[]; variables: string[] } {
  const unicos = (re: RegExp) => [...new Set([...yml.matchAll(re)].map((m) => m[1]!))].sort();
  return {
    secretos: unicos(/\$\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}/g),
    variables: unicos(/\$\{\{\s*vars\.([A-Z0-9_]+)\s*\}\}/g),
  };
}

/** La lista de docs/19 P-01; el test comprueba que el workflow no pide nada fuera de ella. */
export const SECRETOS_ENTORNO = [
  'SUPABASE_URL',
  'SUPABASE_DB_URL',
  'PROPIETARIO_EMAIL',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
];
export const VARIABLES_ENTORNO = [
  'VITE_ENTORNO',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_MAPABASE_URL',
  'VITE_VAPID_PUBLIC_KEY',
  'SUPABASE_PROJECT_REF',
  'PAGES_PROYECTO',
];
/** Solo hace falta si el mapa base va en R2 (> 20 MB, 04 §8); sin ella se sirve desde Pages. */
export const OPCIONALES = new Set(['VITE_MAPABASE_URL']);
/** Secretos que puede tener el environment o el repositorio: GitHub los junta al ejecutar. */
export const TAMBIEN_EN_REPO = new Set(['PROPIETARIO_EMAIL']);
export const SECRETOS_PAGES = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SAL_IP',
  'NOMINATIM_USER_AGENT',
  'VAPID_PRIVATE_KEY',
  'VAPID_PUBLIC_KEY',
  'VAPID_SUBJECT',
  'VIGILANCIA_SECRETO',
];
/** Los de los trabajos automáticos, sin environment (DEC-071; `arranque.ts`, `sufijoDe`). */
export const SECRETOS_REPO = [
  'SUPABASE_DB_URL_PROD',
  'SUPABASE_SERVICE_ROLE_KEY_PROD',
  'VIGILANCIA_SECRETO_PROD',
  'GPG_PUBLIC_KEY',
];
/** La paginación de RV-15 y RV-33 da por hecho este tope de PostgREST (04 §5). */
export const MAX_ROWS_ESPERADO = 1000;

// ---------- de dónde se lee ----------

export interface EstadoToken {
  activo: boolean;
  /** GET /accounts/{id}/workers/scripts respondió: el token ve los Workers. */
  workers: boolean;
  /** GET /accounts/{id}/pages/projects/hidrantes-albolote respondió. */
  pages: boolean;
}

/** Cada fuente devuelve null si no se puede consultar con lo que hay (sin sesión o sin secreto). */
export interface Fuentes {
  secretosEntorno(): string[] | null;
  variablesEntorno(): string[] | null;
  secretosRepo(): string[] | null;
  secretosPages(): string[] | null;
  migracionesAplicadas(): Map<string, string> | null;
  esquemasExpuestos(): Promise<string[] | null>;
  maxRows(): Promise<number | null>;
  token(): Promise<EstadoToken | null>;
}

export type Estado = 'OK' | 'FALTA' | 'NO COMPROBADO';

export interface Fila {
  grupo: string;
  nombre: string;
  estado: Estado;
  imprescindible: boolean;
  nota?: string;
}

// ---------- la comprobación ----------

function presentes(
  grupo: string,
  esperados: string[],
  hay: string[] | null,
  { opcionales = new Set<string>(), alternativa = null as string[] | null, sinAcceso = '' } = {},
): Fila[] {
  return esperados.map((nombre) => {
    const imprescindible = !opcionales.has(nombre);
    if (!hay) return { grupo, nombre, estado: 'NO COMPROBADO', imprescindible, nota: sinAcceso };
    if (hay.includes(nombre)) return { grupo, nombre, estado: 'OK', imprescindible };
    if (alternativa?.includes(nombre)) {
      return { grupo, nombre, estado: 'OK', imprescindible, nota: 'en el repositorio, no en el environment' };
    }
    return {
      grupo,
      nombre,
      estado: 'FALTA',
      imprescindible,
      nota: imprescindible ? undefined : 'opcional: solo con el mapa base en R2',
    };
  });
}

export async function comprobar(f: Fuentes, locales: Migracion[]): Promise<Fila[]> {
  const filas: Fila[] = [];
  const repo = f.secretosRepo();
  filas.push(
    ...presentes('environment production · secretos', SECRETOS_ENTORNO, f.secretosEntorno(), {
      alternativa: repo?.filter((n) => TAMBIEN_EN_REPO.has(n)) ?? null,
      sinAcceso: 'sin sesión de gh con permisos de administrador',
    }),
    ...presentes('environment production · variables', VARIABLES_ENTORNO, f.variablesEntorno(), {
      opcionales: OPCIONALES,
      sinAcceso: 'sin sesión de gh con permisos de administrador',
    }),
    ...presentes('Pages hidrantes-albolote · secretos', SECRETOS_PAGES, f.secretosPages(), {
      sinAcceso: 'sin wrangler con sesión o token',
    }),
    ...presentes('repositorio · secretos', SECRETOS_REPO, repo, {
      sinAcceso: 'sin sesión de gh con permisos de administrador',
    }),
  );

  // Base de datos: lo pendiente se aplica al desplegar; un hash distinto lo impide (migrar.ts).
  const aplicadas = f.migracionesAplicadas();
  const grupoBd = 'base de datos de producción';
  if (!aplicadas) {
    filas.push({
      grupo: grupoBd,
      nombre: 'migraciones',
      estado: 'NO COMPROBADO',
      imprescindible: true,
      nota: 'sin SUPABASE_DB_URL_PROD (comprobar-produccion.yml la tiene)',
    });
  } else {
    const distintas = locales.filter((m) => aplicadas.has(m.archivo) && aplicadas.get(m.archivo) !== m.hash);
    const ajenas = [...aplicadas.keys()].filter((a) => !locales.some((m) => m.archivo === a));
    const pendientes = locales.filter((m) => !aplicadas.has(m.archivo)).map((m) => m.archivo);
    for (const m of distintas) {
      filas.push({ grupo: grupoBd, nombre: m.archivo, estado: 'FALTA', imprescindible: true, nota: 'hash distinto' });
    }
    for (const a of ajenas) {
      filas.push({
        grupo: grupoBd,
        nombre: a,
        estado: 'FALTA',
        imprescindible: true,
        nota: 'no está en el repositorio',
      });
    }
    filas.push({
      grupo: grupoBd,
      nombre: 'migraciones pendientes',
      estado: 'OK',
      imprescindible: false,
      nota: pendientes.length ? `se aplicarán al desplegar: ${pendientes.join(', ')}` : 'ninguna',
    });
  }

  const esquemas = await f.esquemasExpuestos();
  filas.push(
    esquemas === null
      ? {
          grupo: grupoBd,
          nombre: 'hidrantes en la Data API',
          estado: 'NO COMPROBADO',
          imprescindible: true,
          nota: 'sin SUPABASE_URL_PROD y SUPABASE_ANON_KEY_PROD',
        }
      : {
          grupo: grupoBd,
          nombre: 'hidrantes en la Data API',
          estado: esquemas.includes('hidrantes') ? 'OK' : 'FALTA',
          imprescindible: true,
        },
  );
  const maxRows = await f.maxRows();
  filas.push(
    maxRows === null
      ? {
          grupo: grupoBd,
          nombre: 'db_max_rows',
          estado: 'NO COMPROBADO',
          imprescindible: false,
          nota: 'sin SUPABASE_ACCESS_TOKEN (Management API)',
        }
      : {
          grupo: grupoBd,
          nombre: 'db_max_rows',
          estado: maxRows === MAX_ROWS_ESPERADO ? 'OK' : 'FALTA',
          imprescindible: false,
          nota: maxRows === MAX_ROWS_ESPERADO ? undefined : `es ${maxRows}: anótalo en 04 §5 (RV-15, RV-33)`,
        },
  );

  const token = await f.token();
  const grupoCf = 'token de Cloudflare';
  if (!token) {
    filas.push({
      grupo: grupoCf,
      nombre: 'Pages: Edit y Workers Scripts: Edit',
      estado: 'NO COMPROBADO',
      imprescindible: true,
      nota: 'sin CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID (comprobar-produccion.yml los tiene)',
    });
  } else {
    filas.push(
      { grupo: grupoCf, nombre: 'activo', estado: token.activo ? 'OK' : 'FALTA', imprescindible: true },
      { grupo: grupoCf, nombre: 'Pages', estado: token.pages ? 'OK' : 'FALTA', imprescindible: true },
      {
        grupo: grupoCf,
        nombre: 'Workers Scripts',
        estado: token.workers ? 'OK' : 'FALTA',
        imprescindible: true,
        nota: token.workers
          ? undefined
          : 'Cloudflare → My Profile → API Tokens → editar el token → Account · Workers Scripts · Edit (2 min)',
      },
    );
  }
  return filas;
}

export const codigoSalida = (filas: Fila[]) => (filas.some((f) => f.estado === 'FALTA' && f.imprescindible) ? 1 : 0);

export function tabla(filas: Fila[]): string {
  const lineas = ['| Grupo | Qué | Estado | Nota |', '|---|---|---|---|'];
  for (const f of filas) lineas.push(`| ${f.grupo} | ${f.nombre} | ${f.estado} | ${f.nota ?? ''} |`);
  return lineas.join('\n');
}

// ---------- fuentes reales ----------

/** `gh` devuelve un nombre por línea; null si no hay sesión o no hay permiso. */
function nombresGh(ruta: string, campo: 'secrets' | 'variables'): string[] | null {
  const r = ejecutar('gh', ['api', ruta, '--jq', `.${campo}[].name`]);
  return r.codigo === 0 ? r.salida.split(/\r?\n/).filter(Boolean) : null;
}

function variableGh(nombre: string): string | null {
  const r = ejecutar('gh', ['api', `repos/${REPO}/actions/variables/${nombre}`, '--jq', '.value']);
  return r.codigo === 0 ? r.salida.trim() : (process.env[nombre] ?? null);
}

/** Nombres de `wrangler pages secret list`: líneas "  - NOMBRE: Value Encrypted". */
export function nombresWrangler(salida: string): string[] {
  return [...salida.matchAll(/^\s*-\s+([A-Z0-9_]+):/gm)].map((m) => m[1]!);
}

/** Esquemas expuestos, del aviso de PostgREST a un perfil que no existe (PGRST106). Sin token. */
export function esquemasDeAviso(cuerpo: { code?: string; hint?: string }): string[] | null {
  if (cuerpo.code !== 'PGRST106' || !cuerpo.hint) return null;
  const m = /exposed:\s*(.+)$/.exec(cuerpo.hint);
  return m ? m[1]!.split(',').map((s) => s.trim()) : null;
}

function fuentesReales(): Fuentes {
  const env = process.env;
  return {
    secretosEntorno: () => nombresGh(`repos/${REPO}/environments/production/secrets`, 'secrets'),
    variablesEntorno: () => nombresGh(`repos/${REPO}/environments/production/variables`, 'variables'),
    secretosRepo: () => nombresGh(`repos/${REPO}/actions/secrets`, 'secrets'),
    secretosPages: () => {
      const r = ejecutar('npx', ['--no-install', 'wrangler', 'pages', 'secret', 'list', '--project-name', PAGES_PROD]);
      return r.codigo === 0 ? nombresWrangler(r.salida) : null;
    },
    migracionesAplicadas: () => {
      const url = env.SUPABASE_DB_URL_PROD;
      if (!url) return null;
      const r = psql(url, "select archivo || '|' || hash from hidrantes.migraciones_aplicadas order by archivo;", {
        tuplas: true,
      });
      if (r.codigo !== 0) return null;
      return new Map(
        r.salida
          .split(/\r?\n/)
          .filter(Boolean)
          .map((l) => l.trim().split('|') as [string, string]),
      );
    },
    esquemasExpuestos: async () => {
      const url = variableGh('SUPABASE_URL_PROD');
      const anon = variableGh('SUPABASE_ANON_KEY_PROD');
      if (!url || !anon) return null;
      // La raíz de /rest/v1 pide la clave de servicio; una tabla cualquiera ya responde con el aviso.
      const r = await fetch(`${url}/rest/v1/comprobar_esquemas?limit=0`, {
        headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Accept-Profile': 'esquema_que_no_existe' },
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null);
      return r ? esquemasDeAviso((await r.json().catch(() => ({}))) as { code?: string; hint?: string }) : null;
    },
    maxRows: async () => {
      const ref =
        env.SUPABASE_PROJECT_REF_PROD ?? variableGh('SUPABASE_URL_PROD')?.match(/https:\/\/([a-z0-9]+)\./)?.[1];
      if (!env.SUPABASE_ACCESS_TOKEN || !ref) return null;
      const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/postgrest`, {
        headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null);
      if (!r?.ok) return null;
      const cuerpo = (await r.json()) as { max_rows?: number; db_max_rows?: number };
      return cuerpo.max_rows ?? cuerpo.db_max_rows ?? null;
    },
    token: async () => {
      const token = env.CLOUDFLARE_API_TOKEN;
      const cuenta = env.CLOUDFLARE_ACCOUNT_ID;
      if (!token || !cuenta) return null;
      const pedir = (ruta: string) =>
        fetch(`https://api.cloudflare.com/client/v4${ruta}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15_000),
        }).catch(() => null);
      const verificar = await pedir('/user/tokens/verify');
      const activo =
        !!verificar?.ok && ((await verificar.json()) as { result?: { status?: string } }).result?.status === 'active';
      const workers = !!(await pedir(`/accounts/${cuenta}/workers/scripts`))?.ok;
      const pages = !!(await pedir(`/accounts/${cuenta}/pages/projects/${PAGES_PROD}`))?.ok;
      return { activo, workers, pages };
    },
  };
}

async function principal(): Promise<void> {
  log.paso('Producción: lo que la versión actual necesita (solo lectura, sin valores)');
  const yml = readFileSync(path.join(RAIZ, '.github', 'workflows', 'deploy-prod.yml'), 'utf8');
  const { secretos, variables } = requeridosDeWorkflow(yml);
  const fuera = [
    ...secretos.filter((s) => !SECRETOS_ENTORNO.includes(s)),
    ...variables.filter((v) => !VARIABLES_ENTORNO.includes(v)),
  ];
  if (fuera.length) log.aviso(`deploy-prod.yml usa algo que esta lista no conoce: ${fuera.join(', ')}`);
  const filas = await comprobar(fuentesReales(), leerMigraciones());
  console.log(tabla(filas));
  const salida = codigoSalida(filas);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Producción\n\n${tabla(filas)}\n`);
  }
  const sinComprobar = filas.filter((f) => f.estado === 'NO COMPROBADO').length;
  if (sinComprobar) log.aviso(`${sinComprobar} sin comprobar desde aquí: mira la nota de cada una.`);
  if (salida) {
    log.error('Falta algo imprescindible para desplegar: no abras el PR develop → main.');
    process.exitCode = 1;
  } else log.ok('Nada imprescindible falta.');
}

if (import.meta.main) ejecutarScript(principal);
