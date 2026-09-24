// Las tareas de pg_cron que tiene que haber, sacadas de las migraciones (docs/19 RV-56). La vigilancia
// las pasa a scripts/sql/tareas-programadas.sql: una que falte, o una lista vacía tras restaurar en un
// proyecto nuevo, es un problema y no "todo responde".
//
//   npm run tareas-esperadas    reescribe scripts/sql/tareas-esperadas.txt
//
// generar-tareas-esperadas.test.ts comprueba que el archivo está al día con las migraciones.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, ejecutarScript, log } from './lib/comun.ts';

export const ARCHIVO = path.join(RAIZ, 'scripts/sql/tareas-esperadas.txt');
const MIGRACIONES = path.join(RAIZ, 'supabase/migrations');

/**
 * Recorre las migraciones en orden: `cron.schedule('hidrantes_…'` añade la tarea y
 * `cron.unschedule('hidrantes_…'` la quita. Devuelve los nombres ordenados.
 */
export function tareasEsperadas(migraciones: { nombre: string; sql: string }[]): string[] {
  const tareas = new Set<string>();
  const patron = /cron\.(un)?schedule\(\s*'(hidrantes_[a-z_]+)'/g;
  for (const m of [...migraciones].sort((a, b) => a.nombre.localeCompare(b.nombre))) {
    for (const [, quitar, nombre] of m.sql.matchAll(patron)) {
      if (quitar) tareas.delete(nombre!);
      else tareas.add(nombre!);
    }
  }
  return [...tareas].sort();
}

export function leerMigraciones(dir = MIGRACIONES): { nombre: string; sql: string }[] {
  return readdirSync(dir)
    .filter((a) => a.endsWith('.sql'))
    .map((nombre) => ({ nombre, sql: readFileSync(path.join(dir, nombre), 'utf8') }));
}

export const contenido = (tareas: string[]) => `${tareas.join('\n')}\n`;

async function principal(): Promise<void> {
  const tareas = tareasEsperadas(leerMigraciones());
  writeFileSync(ARCHIVO, contenido(tareas));
  log.ok(`${tareas.length} tareas en scripts/sql/tareas-esperadas.txt`);
}

if (import.meta.main) ejecutarScript(principal);
