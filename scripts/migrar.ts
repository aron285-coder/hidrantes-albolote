// Aplica supabase/migrations con psql contra un historial propio (04 §5, §12).
// Nunca `supabase db push`: la base de datos es compartida con la app de uniformidad.
//
//   npm run migrar -- --local        Supabase local (supabase start); prepara también el rol
//   npm run migrar                   usa SUPABASE_DB_URL (rol hidrantes_migrador), como en CI
//   npm run migrar -- --comprobar    solo lista lo pendiente y verifica hashes; no aplica nada

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, abortar, argumentos, ejecutarScript, log, psqlOk } from './lib/comun.ts';

const DIR_MIGRACIONES = path.join(RAIZ, 'supabase', 'migrations');
const PATRON = /^\d{4}_[a-z0-9_]+\.sql$/;

// Supabase local (supabase/config.toml, puerto 55422). Credenciales de desarrollo, solo locales.
export const LOCAL_POSTGRES = 'postgresql://postgres:postgres@127.0.0.1:55422/postgres';
export const LOCAL_CLAVE_MIGRADOR = 'migrador-local';
export const LOCAL_MIGRADOR = `postgresql://hidrantes_migrador:${LOCAL_CLAVE_MIGRADOR}@127.0.0.1:55422/postgres`;

export function hashDe(contenido: string): string {
  return createHash('sha256').update(contenido.replace(/\r\n/g, '\n')).digest('hex');
}

export interface Migracion {
  archivo: string;
  contenido: string;
  hash: string;
}

export function leerMigraciones(dir = DIR_MIGRACIONES): Migracion[] {
  // Sin carpeta = sin migraciones todavía (Git no guarda carpetas vacías).
  if (!existsSync(dir)) return [];
  const archivos = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of archivos) {
    if (!PATRON.test(f)) abortar(`Nombre de migración no válido: ${f} (formato 0001_descripcion.sql)`);
  }
  const numeros = archivos.map((f) => f.slice(0, 4));
  const repetido = numeros.find((n, i) => numeros.indexOf(n) !== i);
  if (repetido) abortar(`Dos migraciones con el número ${repetido}`);
  return archivos.map((archivo) => {
    const contenido = readFileSync(path.join(dir, archivo), 'utf8');
    return { archivo, contenido, hash: hashDe(contenido) };
  });
}

/** Decide qué aplicar. Aborta si una migración aplicada cambió o desapareció del repositorio. */
export function planificar(locales: Migracion[], aplicadas: Map<string, string>): Migracion[] {
  for (const [archivo, hash] of aplicadas) {
    const local = locales.find((m) => m.archivo === archivo);
    if (!local) abortar(`La base de datos tiene aplicada ${archivo}, que no está en el repositorio.`);
    if (local.hash !== hash) {
      abortar(`${archivo} cambió después de aplicarse. Nunca se edita una migración aplicada: crea otra nueva.`);
    }
  }
  const pendientes = locales.filter((m) => !aplicadas.has(m.archivo));
  const ultimaAplicada = [...aplicadas.keys()].sort().at(-1);
  const fueraDeOrden = ultimaAplicada && pendientes.find((m) => m.archivo < ultimaAplicada);
  if (fueraDeOrden) abortar(`${fueraDeOrden.archivo} es anterior a la última aplicada (${ultimaAplicada}).`);
  return pendientes;
}

const SQL_HISTORIAL = `
create table if not exists hidrantes.migraciones_aplicadas (
  archivo     text primary key,
  hash        text not null,
  aplicada_en timestamptz not null default now()
);`;

function leerAplicadas(url: string): Map<string, string> {
  psqlOk(url, SQL_HISTORIAL);
  const salida = psqlOk(url, "select archivo || '|' || hash from hidrantes.migraciones_aplicadas order by archivo;", {
    tuplas: true,
  });
  return new Map(
    salida
      // psql en Windows termina las líneas con \r\n: sin quitarlo, ningún hash coincidiría
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => l.trim().split('|') as [string, string]),
  );
}

function aplicar(url: string, m: Migracion): void {
  // Una transacción por migración: el archivo y su fila de historial entran juntos o no entran.
  const sql = [
    'begin;',
    "select pg_advisory_xact_lock(hashtext('hidrantes.migrar'));",
    m.contenido,
    `insert into hidrantes.migraciones_aplicadas (archivo, hash) values ('${m.archivo}', '${m.hash}');`,
    'commit;',
  ].join('\n');
  psqlOk(url, sql);
}

export function prepararLocal(): void {
  const bootstrap = readFileSync(path.join(RAIZ, 'supabase', 'sql', 'arranque-bd.sql'), 'utf8');
  psqlOk(LOCAL_POSTGRES, `\\set clave '${LOCAL_CLAVE_MIGRADOR}'\n${bootstrap}`);
  psqlOk(LOCAL_POSTGRES, readFileSync(path.join(RAIZ, 'supabase', 'sql', 'local-storage.sql'), 'utf8'));
}

async function principal(): Promise<void> {
  const { banderas } = argumentos();
  let url: string;
  if (banderas.has('local')) {
    log.paso('Supabase local: preparando el rol hidrantes_migrador');
    prepararLocal();
    url = LOCAL_MIGRADOR;
  } else {
    url = process.env.SUPABASE_DB_URL ?? abortar('Falta SUPABASE_DB_URL (o usa --local).');
    const usuario = decodeURIComponent(new URL(url).username);
    if (!usuario.startsWith('hidrantes_migrador')) {
      abortar(`SUPABASE_DB_URL usa el usuario "${usuario}"; debe ser hidrantes_migrador (DEC-052).`);
    }
  }

  log.paso('Migraciones');
  const locales = leerMigraciones();
  const pendientes = planificar(locales, leerAplicadas(url));
  log.info(`${locales.length} en el repositorio, ${pendientes.length} pendientes`);
  if (banderas.has('comprobar')) {
    for (const m of pendientes) log.info(`pendiente: ${m.archivo}`);
    return;
  }
  for (const m of pendientes) {
    aplicar(url, m);
    log.ok(m.archivo);
  }
  log.ok('Base de datos al día');
}

if (import.meta.main) ejecutarScript(principal);
