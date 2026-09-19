// Carga datos/limite-municipal.geojson y datos/nucleos.geojson en la base de datos (05 §2.11, 04 §8).
// Upsert idempotente, en una transacción, como hidrantes_migrador. No va por migración: regenerar
// el límite no debe crear una migración nueva cada vez.
//
//   npm run cargar-zona              usa SUPABASE_DB_URL (CI, tras migrar)
//   npm run cargar-zona -- --local   Supabase local
//
// Los núcleos se añaden o actualizan, nunca se borran: jefatura puede añadir desde Ajustes los que
// OSM no traiga (FR-166).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, abortar, argumentos, ejecutarScript, log, psqlOk } from './lib/comun.ts';
import type { Zona } from './lib/zona.ts';
import { LOCAL_MIGRADOR } from './migrar.ts';

const leer = <T>(f: string): T => JSON.parse(readFileSync(path.join(RAIZ, 'datos', f), 'utf8')) as T;
const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;
const geometria = (g: unknown) =>
  `extensions.st_setsrid(extensions.st_geomfromgeojson(${literal(JSON.stringify(g))}), 4326)`;

export function sqlCarga(limites: Zona['limites'], nucleos: Zona['nucleos'], version: string): string {
  const v = literal(version);
  const filasLimite = limites.features.map(
    (f) =>
      `(${literal(f.properties.municipio)}, extensions.st_multi(${geometria(f.geometry)})::extensions.geography, ${v})`,
  );
  const filasNucleo = nucleos.features.map(
    (f) =>
      `(${literal(f.properties.nombre)}, ${literal(f.properties.municipio)}, ${geometria(f.geometry)}::extensions.geography, ${v})`,
  );
  return [
    'begin;',
    `insert into hidrantes.limite_municipal (municipio, geom, version) values\n  ${filasLimite.join(',\n  ')}`,
    'on conflict (municipio) do update set geom = excluded.geom, version = excluded.version;',
    `insert into hidrantes.nucleos (nombre, municipio, geom, version) values\n  ${filasNucleo.join(',\n  ')}`,
    'on conflict (nombre) do update set municipio = excluded.municipio, geom = excluded.geom, version = excluded.version;',
    // Salud del sistema muestra de cuándo es la zona (FR-143)
    `insert into hidrantes.config (clave, valor, actualizado_por) values ('version_zona', to_jsonb(${v}::text), 'cargar-zona')`,
    'on conflict (clave) do update set valor = excluded.valor, actualizado_por = excluded.actualizado_por;',
    'commit;',
  ].join('\n');
}

async function principal(): Promise<void> {
  const { banderas } = argumentos();
  const url = banderas.has('local')
    ? LOCAL_MIGRADOR
    : (process.env.SUPABASE_DB_URL ?? abortar('Falta SUPABASE_DB_URL (o usa --local).'));

  log.paso('Zona de cobertura → base de datos');
  const existen = psqlOk(
    url,
    "select (to_regclass('hidrantes.limite_municipal') is not null and to_regclass('hidrantes.nucleos') is not null)::int;",
    { tuplas: true },
  );
  if (existen !== '1') {
    // Las tablas llegan con la migración 0001 (Fase 2). Hasta entonces el despliegue sigue (DEC-057).
    log.aviso('Las tablas limite_municipal y nucleos aún no existen (llegan en la Fase 2): no se carga nada.');
    return;
  }

  const meta = leer<{ version: string }>('meta.json');
  const limites = leer<Zona['limites']>('limite-municipal.geojson');
  const nucleos = leer<Zona['nucleos']>('nucleos.geojson');
  psqlOk(url, sqlCarga(limites, nucleos, meta.version));
  log.ok(`${limites.features.length} términos y ${nucleos.features.length} núcleos · versión ${meta.version}`);
}

if (import.meta.main) ejecutarScript(principal);
