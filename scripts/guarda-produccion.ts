// Guarda de deploy-prod.yml (04 §4): aborta si algo apunta a un proyecto que no es producción,
// si la conexión no usa el rol hidrantes_migrador, si el flujo menciona el seed de staging, o si el
// servidor de push falso de las pruebas (PUSH_ENDPOINT_PRUEBAS, RV-86, DEC-120) asoma por algún lado.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, abortar, ejecutarScript, log } from './lib/comun.ts';

export interface EntradaGuarda {
  entorno?: string;
  proyectoPages?: string;
  ref?: string;
  supabaseUrl?: string;
  dbUrl?: string;
  flujo: string;
  /** Valor de PUSH_ENDPOINT_PRUEBAS en el entorno del despliegue: tiene que faltar. */
  pushEndpointPruebas?: string;
  /** scripts/arranque.ts, que es quien sube los secretos de Pages: no puede subir esa variable. */
  arranque?: string;
}

const PUSH_PRUEBAS = 'PUSH_ENDPOINT_PRUEBAS';

/** Devuelve la lista de problemas; vacía si se puede desplegar. */
export function comprobarGuarda(e: EntradaGuarda): string[] {
  const p: string[] = [];
  if (e.entorno !== 'produccion') p.push('VITE_ENTORNO no es "produccion"');
  if (e.proyectoPages !== 'hidrantes-albolote') p.push('PAGES_PROYECTO no es "hidrantes-albolote"');
  if (!e.ref || !/^[a-z0-9]{20}$/.test(e.ref)) p.push('SUPABASE_PROJECT_REF falta o no tiene forma de ref');
  else {
    if (!e.supabaseUrl || new URL(e.supabaseUrl).hostname !== `${e.ref}.supabase.co`) {
      p.push('SUPABASE_URL no es el proyecto de SUPABASE_PROJECT_REF');
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
  return p;
}

async function principal(): Promise<void> {
  const problemas = comprobarGuarda({
    entorno: process.env.VITE_ENTORNO,
    proyectoPages: process.env.PAGES_PROYECTO,
    ref: process.env.SUPABASE_PROJECT_REF,
    supabaseUrl: process.env.SUPABASE_URL,
    dbUrl: process.env.SUPABASE_DB_URL,
    flujo: readFileSync(path.join(RAIZ, '.github', 'workflows', 'deploy-prod.yml'), 'utf8'),
    pushEndpointPruebas: process.env.PUSH_ENDPOINT_PRUEBAS,
    arranque: readFileSync(path.join(RAIZ, 'scripts', 'arranque.ts'), 'utf8'),
  });
  if (problemas.length) abortar(`Guarda de producción:\n  - ${problemas.join('\n  - ')}`);
  log.ok('Guarda de producción superada');
}

if (import.meta.main) ejecutarScript(principal);
