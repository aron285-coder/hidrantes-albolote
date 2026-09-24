// ¿Tiene producción todo lo que la versión actual necesita? (docs/19 P-01, DEC-096). Solo lectura:
// no cambia nada y **nunca imprime valores**, solo nombres (DEC-053).
//
//   npm run comprobar-produccion -- --completo
//        **La que se usa antes del PR develop → main** (docs/20 P-10 y RV-73). Hace la mitad local
//        (GitHub con gh, Pages con wrangler, Data API), lanza comprobar-produccion.yml para la otra
//        (la base de datos y el token de Cloudflare, con secretos que en local no hay), espera, y une
//        las dos en una tabla. Solo nombres y estados viajan entre las dos.
//   npm run comprobar-produccion           solo la mitad local
//   comprobar-produccion.yml               solo la mitad de Actions (--parcial --json)
//
// Cada comprobación que no se puede hacer con lo que hay sale como NO COMPROBADO, nunca como OK.
// Termina con 1 si falta algo imprescindible para desplegar, y con 2 si algo imprescindible queda
// sin comprobar: "falta la otra mitad". Con --parcial, eso último sale con 0 y el resumen lo dice.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RAIZ, abortar, argumentos, ejecutar, ejecutarScript, log, psql } from './lib/comun.ts';
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
  /**
   * GET …/workers/scripts/hidrantes-avisos/secrets respondió: el token puede **desplegar** el Worker.
   * Solo lista nombres, y solo con Workers Scripts: Edit (el primer despliegue falló ahí, 24 sep
   * 2026). Null si el Worker aún no existe: entonces no se puede saber sin tocar nada.
   */
  workersEdicion?: boolean | null;
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
      {
        grupo: grupoCf,
        nombre: 'Workers Scripts: Edit',
        estado: token.workersEdicion === true ? 'OK' : token.workersEdicion === false ? 'FALTA' : 'NO COMPROBADO',
        // No para el PR develop → main: deploy-prod.yml no despliega el Worker, lo hace deploy-staging.
        imprescindible: false,
        nota:
          token.workersEdicion === false
            ? 'Cloudflare → My Profile → API Tokens → editar el token → Account · Workers Scripts · Edit (2 min): ve los Workers pero deploy-staging no puede actualizar hidrantes-avisos. No impide desplegar producción'
            : token.workersEdicion == null
              ? 'el Worker hidrantes-avisos aún no existe: se sabrá en su primer despliegue'
              : undefined,
      },
    );
  }
  return filas;
}

/**
 * 1 si falta algo imprescindible; 2 si algo imprescindible queda sin comprobar, salvo con `parcial`.
 * Antes, las filas NO COMPROBADO no contaban, y cada mitad salía con 0 sin haber mirado lo obligatorio
 * de la otra (docs/20 RV-73).
 */
export function codigoSalida(filas: Fila[], { parcial = false } = {}): 0 | 1 | 2 {
  if (filas.some((f) => f.estado === 'FALTA' && f.imprescindible)) return 1;
  if (!parcial && filas.some((f) => f.estado === 'NO COMPROBADO' && f.imprescindible)) return 2;
  return 0;
}

/**
 * Las dos mitades en una: lo que la local no pudo comprobar se toma de la de Actions, si esta sí
 * pudo. Lo que solo está en una se conserva.
 */
export function unirMitades(local: Fila[], actions: Fila[]): Fila[] {
  const clave = (f: Fila) => `${f.grupo}\u0000${f.nombre}`;
  const deActions = new Map(actions.map((f) => [clave(f), f]));
  const unidas = local.map((f) => {
    const otra = deActions.get(clave(f));
    return f.estado === 'NO COMPROBADO' && otra && otra.estado !== 'NO COMPROBADO' ? otra : f;
  });
  const vistas = new Set(local.map(clave));
  return [...unidas, ...actions.filter((f) => !vistas.has(clave(f)))];
}

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
      const secretos = await pedir(`/accounts/${cuenta}/workers/scripts/hidrantes-avisos/secrets`);
      const workersEdicion = !secretos || secretos.status === 404 ? null : secretos.ok;
      const pages = !!(await pedir(`/accounts/${cuenta}/pages/projects/${PAGES_PROD}`))?.ok;
      return { activo, workers, workersEdicion, pages };
    },
  };
}

const WORKFLOW = 'comprobar-produccion.yml';

/** La mitad de Actions: lanza el workflow, espera y lee sus filas (artefacto sin valores). */
async function mitadDeActions(): Promise<Fila[]> {
  const desde = new Date(Date.now() - 5_000).toISOString();
  const lanzar = ejecutar('gh', ['workflow', 'run', WORKFLOW, '--repo', REPO, '--ref', 'develop']);
  if (lanzar.codigo !== 0) abortar(`No se ha podido lanzar ${WORKFLOW}: ${lanzar.salida.trim()}`);
  let id = '';
  for (let i = 0; i < 30 && !id; i++) {
    const r = ejecutar('gh', [
      'run',
      'list',
      '--repo',
      REPO,
      '--workflow',
      WORKFLOW,
      '--event',
      'workflow_dispatch',
      '-L',
      '5',
      '--json',
      'databaseId,createdAt',
      '--jq',
      `[.[] | select(.createdAt >= "${desde}")] | last | .databaseId // ""`,
    ]);
    id = r.codigo === 0 ? r.salida.trim() : '';
    if (!id) await new Promise((ok) => setTimeout(ok, 4_000));
  }
  if (!id) abortar(`${WORKFLOW} no ha empezado: míralo en Actions.`);
  log.info(`Esperando a ${WORKFLOW} (run ${id})…`);
  ejecutar('gh', ['run', 'watch', id, '--repo', REPO, '--exit-status', '--interval', '10']);
  const dir = mkdtempSync(path.join(tmpdir(), 'comprobar-produccion-'));
  try {
    const bajar = ejecutar('gh', ['run', 'download', id, '--repo', REPO, '-n', 'filas-produccion', '-D', dir]);
    if (bajar.codigo !== 0)
      abortar(`No se han podido leer las filas de ${WORKFLOW} (run ${id}): ${bajar.salida.trim()}`);
    return JSON.parse(readFileSync(path.join(dir, 'filas-produccion.json'), 'utf8')) as Fila[];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function principal(): Promise<void> {
  const { banderas, valores } = argumentos();
  const parcial = banderas.has('parcial');
  const completo = banderas.has('completo');
  log.paso('Producción: lo que la versión actual necesita (solo lectura, sin valores)');
  const yml = readFileSync(path.join(RAIZ, '.github', 'workflows', 'deploy-prod.yml'), 'utf8');
  const { secretos, variables } = requeridosDeWorkflow(yml);
  const fuera = [
    ...secretos.filter((s) => !SECRETOS_ENTORNO.includes(s)),
    ...variables.filter((v) => !VARIABLES_ENTORNO.includes(v)),
  ];
  if (fuera.length) log.aviso(`deploy-prod.yml usa algo que esta lista no conoce: ${fuera.join(', ')}`);
  let filas = await comprobar(fuentesReales(), leerMigraciones());
  if (completo) filas = unirMitades(filas, await mitadDeActions());
  const json = valores.get('json');
  // Solo grupo, nombre, estado y nota: nunca valores (DEC-053).
  if (json) writeFileSync(json, JSON.stringify(filas, null, 2));
  console.log(tabla(filas));
  const salida = codigoSalida(filas, { parcial });
  const sinComprobar = filas.filter((f) => f.estado === 'NO COMPROBADO' && f.imprescindible).length;
  const otraMitad = process.env.GITHUB_ACTIONS
    ? 'npm run comprobar-produccion -- --completo en local (GitHub y Pages)'
    : 'npm run comprobar-produccion -- --completo, que lanza comprobar-produccion.yml';
  const resumen =
    salida === 1
      ? 'Falta algo imprescindible para desplegar: no abras el PR develop → main.'
      : salida === 2
        ? `${sinComprobar} imprescindibles sin comprobar: falta la otra mitad: ejecuta también ${otraMitad}.`
        : sinComprobar
          ? `Mitad comprobada (--parcial): ${sinComprobar} imprescindibles quedan para la otra mitad (${otraMitad}).`
          : 'Nada imprescindible falta, y todo lo imprescindible está comprobado.';
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Producción\n\n${tabla(filas)}\n\n${resumen}\n`);
  }
  if (salida === 1) log.error(resumen);
  else if (salida === 2 || sinComprobar) log.aviso(resumen);
  else log.ok(resumen);
  process.exitCode = salida;
}

if (import.meta.main) ejecutarScript(principal);
