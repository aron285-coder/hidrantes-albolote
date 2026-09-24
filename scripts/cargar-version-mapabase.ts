// Anuncia en config la versión del mapa base desplegado y la del callejero, para Salud del sistema
// (FR-143, docs/17 RV-21, docs/18 GM-04). fn_salud leía config.version_mapabase y nada la
// escribía: la versión solo vivía en datos/mapabase.json. Los despliegues lo ejecutan **después** de
// desplegar y de comprobar lo servido: la versión se anuncia cuando el archivo ya se sirve.
//
//   npm run cargar-version-mapabase              usa SUPABASE_DB_URL (despliegues)
//   npm run cargar-version-mapabase -- --local   Supabase local

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, abortar, argumentos, ejecutarScript, log, psqlOk } from './lib/comun.ts';
import { LOCAL_MIGRADOR } from './migrar.ts';

const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;

function sqlVersion(clave: string, archivo: string, meta: { version: string }): string {
  if (!meta || typeof meta.version !== 'string' || !meta.version.trim()) {
    abortar(`datos/${archivo} no trae una versión.`);
  }
  return [
    `insert into hidrantes.config (clave, valor, actualizado_por) values ('${clave}', to_jsonb(${literal(meta.version)}::text), 'despliegue')`,
    'on conflict (clave) do update set valor = excluded.valor, actualizado_por = excluded.actualizado_por;',
  ].join('\n');
}

export const sqlVersionMapabase = (meta: { version: string }) => sqlVersion('version_mapabase', 'mapabase.json', meta);
export const sqlVersionCallejero = (meta: { version: string }) =>
  sqlVersion('version_callejero', 'callejero.json', meta);

async function principal(): Promise<void> {
  const { banderas } = argumentos();
  const url = banderas.has('local')
    ? LOCAL_MIGRADOR
    : (process.env.SUPABASE_DB_URL ?? abortar('Falta SUPABASE_DB_URL (o usa --local).'));
  const meta = JSON.parse(readFileSync(path.join(RAIZ, 'datos', 'mapabase.json'), 'utf8')) as { version: string };
  psqlOk(url, sqlVersionMapabase(meta));
  log.ok(`version_mapabase = ${meta.version}`);
  const callejero = JSON.parse(readFileSync(path.join(RAIZ, 'datos', 'callejero.json'), 'utf8')) as { version: string };
  psqlOk(url, sqlVersionCallejero(callejero));
  log.ok(`version_callejero = ${callejero.version}`);
}

if (import.meta.main) ejecutarScript(principal);
