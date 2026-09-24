// Tras cada despliegue a producción: ¿es producción la versión de staging? (docs/19 P-03, DEC-096).
// Solo lectura. Falla el despliegue si algo no coincide.
//
//   npm run paridad -- --url https://hidrantes-albolote.pages.dev     (deploy-prod.yml, con SUPABASE_DB_URL)
//
// 1. `main` tiene el mismo árbol que `develop`: el del commit fusionado si HEAD es el merge commit
//    del PR (así da igual que develop haya avanzado durante el PR), o el de origin/develop si no.
// 2. El frontend servido lleva el commit desplegado (<meta name="commit">, vite.config.ts).
// 3. La base de datos tiene todas las migraciones del repositorio, con el mismo hash.
// 4. Las Functions de la versión actual existen: /api/push y /api/geocodificar sin credenciales
//    dan 401. Son peticiones sin efectos.
// 5. config.version_mapabase y config.version_callejero son las de datos/.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, abortar, argumentos, ejecutar, ejecutarScript, log, psql } from './lib/comun.ts';
import { type Migracion, leerMigraciones } from './migrar.ts';

export interface Estado {
  /** El árbol de HEAD coincide con el de develop (o del commit fusionado). */
  arbolIgual: boolean;
  /** Con qué se ha comparado, para el mensaje. */
  comparadoCon: string;
  commitEsperado: string;
  commitServido: string | null;
  aplicadas: Map<string, string>;
  estadoPush: number | null;
  estadoGeocodificar: number | null;
  config: { version_mapabase: string | null; version_callejero: string | null };
}

export interface Esperado {
  locales: Migracion[];
  versionMapabase: string;
  versionCallejero: string;
}

export function problemasDeParidad(e: Estado, x: Esperado): string[] {
  const p: string[] = [];
  if (!e.arbolIgual) p.push(`main no tiene el mismo árbol que ${e.comparadoCon}`);
  if (e.commitServido === null) p.push('el frontend servido no dice su commit (<meta name="commit">)');
  else if (e.commitServido !== e.commitEsperado) {
    p.push(`el frontend servido es del commit ${e.commitServido.slice(0, 7)}, no del ${e.commitEsperado.slice(0, 7)}`);
  }
  for (const m of x.locales) {
    const hash = e.aplicadas.get(m.archivo);
    if (hash === undefined) p.push(`falta la migración ${m.archivo} en producción`);
    else if (hash !== m.hash) p.push(`la migración ${m.archivo} tiene otro hash en producción`);
  }
  if (e.estadoPush !== 401) p.push(`POST /api/push sin credenciales da ${e.estadoPush ?? 'error de red'}, no 401`);
  if (e.estadoGeocodificar !== 401) {
    p.push(`POST /api/geocodificar sin credenciales da ${e.estadoGeocodificar ?? 'error de red'}, no 401`);
  }
  if (e.config.version_mapabase !== x.versionMapabase) {
    p.push(`config.version_mapabase es ${e.config.version_mapabase ?? 'null'}, no ${x.versionMapabase}`);
  }
  if (e.config.version_callejero !== x.versionCallejero) {
    p.push(`config.version_callejero es ${e.config.version_callejero ?? 'null'}, no ${x.versionCallejero}`);
  }
  return p;
}

/** El commit que el build anota en <meta name="commit" content="…">. */
export function commitDeHtml(html: string): string | null {
  return /<meta name="commit" content="([0-9a-f]{7,40})"/.exec(html)?.[1] ?? null;
}

// ---------- fuentes reales ----------

function git(args: string[]): { ok: boolean; salida: string } {
  const r = ejecutar('git', args);
  return { ok: r.codigo === 0, salida: r.salida.trim() };
}

function arbol(): { igual: boolean; con: string } {
  // Merge commit del PR develop → main: su segundo padre es el develop fusionado.
  const fusionado = git(['rev-parse', '-q', '--verify', 'HEAD^2']);
  if (fusionado.ok)
    return {
      igual: git(['diff', '--quiet', 'HEAD^2', 'HEAD']).ok,
      con: `develop fusionado (${fusionado.salida.slice(0, 7)})`,
    };
  git(['fetch', '-q', 'origin', 'develop']);
  return { igual: git(['diff', '--quiet', 'origin/develop', 'HEAD']).ok, con: 'origin/develop' };
}

async function estadoSinCredenciales(url: string): Promise<number | null> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  return r?.status ?? null;
}

function leerAplicadas(bd: string): Map<string, string> {
  const r = psql(bd, "select archivo || '|' || hash from hidrantes.migraciones_aplicadas order by archivo;", {
    tuplas: true,
  });
  if (r.codigo !== 0) abortar('No se puede leer hidrantes.migraciones_aplicadas de producción.');
  return new Map(
    r.salida
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => l.trim().split('|') as [string, string]),
  );
}

function leerConfig(bd: string, clave: string): string | null {
  const r = psql(bd, `select hidrantes.fn_config('${clave}', 'null') #>> '{}';`, { tuplas: true });
  const v = r.codigo === 0 ? r.salida.trim() : '';
  return v === '' ? null : v;
}

async function principal(): Promise<void> {
  const { valores } = argumentos();
  const url = valores.get('url') ?? abortar('Falta --url');
  const bd = process.env.SUPABASE_DB_URL ?? abortar('Falta SUPABASE_DB_URL.');
  const commitEsperado = process.env.GITHUB_SHA ?? git(['rev-parse', 'HEAD']).salida;
  log.paso(`Paridad de producción con develop · ${commitEsperado.slice(0, 7)}`);

  const { igual, con } = arbol();
  // Pages tarda unos segundos en propagar; comprobar-despliegue ya esperó, pero se reintenta igual.
  let commitServido: string | null = null;
  for (let i = 0; i < 6 && commitServido !== commitEsperado; i++) {
    if (i) await new Promise((ok) => setTimeout(ok, 10_000));
    const r = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } }).catch(() => null);
    commitServido = r ? commitDeHtml(await r.text()) : null;
  }
  const leerDatos = (a: string) =>
    (JSON.parse(readFileSync(path.join(RAIZ, 'datos', a), 'utf8')) as { version: string }).version;
  const problemas = problemasDeParidad(
    {
      arbolIgual: igual,
      comparadoCon: con,
      commitEsperado,
      commitServido,
      aplicadas: leerAplicadas(bd),
      estadoPush: await estadoSinCredenciales(new URL('/api/push', url).href),
      estadoGeocodificar: await estadoSinCredenciales(new URL('/api/geocodificar', url).href),
      config: {
        version_mapabase: leerConfig(bd, 'version_mapabase'),
        version_callejero: leerConfig(bd, 'version_callejero'),
      },
    },
    {
      locales: leerMigraciones(),
      versionMapabase: leerDatos('mapabase.json'),
      versionCallejero: leerDatos('callejero.json'),
    },
  );
  const resumen = problemas.length
    ? `Producción **no** es la versión de staging:\n\n${problemas.map((x) => `- ${x}`).join('\n')}`
    : `Producción es la versión de staging: árbol igual que ${con}, frontend del commit ${commitEsperado.slice(0, 7)}, las ${leerMigraciones().length} migraciones, las Functions y las versiones de datos.`;
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Paridad con develop\n\n${resumen}\n`);
  }
  if (problemas.length) abortar(resumen);
  log.ok(resumen);
}

if (import.meta.main) ejecutarScript(principal);
