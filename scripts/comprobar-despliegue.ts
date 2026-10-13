// Tras desplegar: la app responde, sirve la versión esperada, las cabeceras de TR-100 y el mapa base
// (teselas sueltas y PMTiles entero, docs/20 RV-71).
// Solo lectura, sin datos ni secretos. La usan los trabajos «comprobar» de deploy-staging.yml y
// deploy-prod.yml (docs/35 RV-410). Con VIGILANCIA_SECRETO en local, también mira la caché de staging.
//
//   npm run comprobar-despliegue -- --url https://hidrantes-albolote-staging.pages.dev --entorno staging

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, abortar, argumentos, ejecutarScript, log } from './lib/comun.ts';
import { comprobarCaches } from './comprobar-caches.ts';
import { teselasDelRecuadro } from './lib/pmtiles.ts';

// docs/35 RV-410: la comprobación de la caché vive en comprobar-caches.ts (solo Node, con el secreto).
export { estadoCache } from './comprobar-caches.ts';

export interface Pagina {
  estado: number;
  cabeceras: Headers;
  html: string;
  robots: string;
}

export function comprobarPagina(p: Pagina, entorno: 'staging' | 'produccion', version: string): string[] {
  const problemas: string[] = [];
  const c = (n: string) => p.cabeceras.get(n) ?? '';
  if (p.estado !== 200) problemas.push(`estado ${p.estado}`);
  if (!p.html.includes(`<meta name="version" content="${version}"`)) problemas.push(`no sirve la versión ${version}`);

  const csp = c('content-security-policy');
  if (!csp) problemas.push('falta Content-Security-Policy');
  if (csp.includes('unsafe-eval')) problemas.push('la CSP permite unsafe-eval');
  if (!/max-age=\d{7,}/.test(c('strict-transport-security'))) problemas.push('falta Strict-Transport-Security');
  if (c('x-content-type-options') !== 'nosniff') problemas.push('falta X-Content-Type-Options: nosniff');
  if (c('referrer-policy') !== 'strict-origin-when-cross-origin') problemas.push('Referrer-Policy incorrecta');
  const permisos = c('permissions-policy');
  if (!permisos.includes('camera=(self)') || !permisos.includes('geolocation=(self)')) {
    problemas.push('Permissions-Policy no limita cámara y geolocalización al propio origen');
  }

  const noindex = p.html.includes('name="robots" content="noindex');
  const bloqueado = /Disallow:\s*\/\s*$/m.test(p.robots);
  if (entorno === 'staging' && (!noindex || !bloqueado)) problemas.push('staging no está marcado noindex / Disallow');
  if (entorno === 'produccion' && (noindex || bloqueado)) problemas.push('producción está marcada noindex / Disallow');
  return problemas;
}

async function principal(): Promise<void> {
  const { valores } = argumentos();
  const url = valores.get('url') ?? abortar('Falta --url');
  const entorno = valores.get('entorno') as 'staging' | 'produccion';
  if (!['staging', 'produccion'].includes(entorno)) abortar('--entorno staging | produccion');
  const version = JSON.parse(readFileSync(path.join(RAIZ, 'package.json'), 'utf8')).version as string;

  // Pages tarda unos segundos en propagar un despliegue nuevo.
  let problemas: string[] = [];
  for (let intento = 1; intento <= 6; intento++) {
    const r = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
    const robots = await (await fetch(new URL('/robots.txt', url))).text();
    problemas = comprobarPagina(
      { estado: r.status, cabeceras: r.headers, html: await r.text(), robots },
      entorno,
      version,
    );
    if (problemas.length === 0) break;
    await new Promise((ok) => setTimeout(ok, 10_000));
  }
  if (problemas.length) abortar(`${url}:\n  - ${problemas.join('\n  - ')}`);
  log.ok(`${url} responde con la versión ${version} y las cabeceras de TR-100`);

  const mapabase = await comprobarMapabase(url);
  if (mapabase.length) abortar(`${url}, mapa base:\n  - ${mapabase.join('\n  - ')}`);

  const secreto = process.env.VIGILANCIA_SECRETO;
  if (entorno === 'staging' && secreto) await comprobarCaches(url, secreto);
}

/** Lo que se ha visto al pedir una tesela suelta y el PMTiles entero (docs/20 RV-71). */
export interface RespuestasMapabase {
  tesela: { ruta: string; estado: number; tipo: string };
  archivo: { estado: number; bytes: number };
}

/** Tipos que aceptan la app y el Service Worker para una tesela MVT. */
export const TIPOS_TESELA = ['application/vnd.mapbox-vector-tile', 'application/x-protobuf'];

export function comprobarRespuestasMapabase(r: RespuestasMapabase, bytesEsperados: number): string[] {
  const problemas: string[] = [];
  const tipo = r.tesela.tipo.split(';')[0].trim();
  if (r.tesela.estado !== 200) problemas.push(`${r.tesela.ruta}: estado ${r.tesela.estado}`);
  else if (!TIPOS_TESELA.includes(tipo)) {
    problemas.push(`${r.tesela.ruta}: Content-Type ${tipo || 'vacío'}, no de tesela MVT (${TIPOS_TESELA.join(' o ')})`);
  }
  if (r.archivo.estado !== 200) problemas.push(`el PMTiles entero: estado ${r.archivo.estado}`);
  else if (r.archivo.bytes !== bytesEsperados) {
    problemas.push(`el PMTiles entero pesa ${r.archivo.bytes} bytes y datos/mapabase.json dice ${bytesEsperados}`);
  }
  return problemas;
}

/** Primera tesela z10 del recuadro de datos/mapabase.json: existe siempre que el mapa base esté publicado. */
export function rutaTeselaDePrueba(info: { version: string; recuadro: number[] }): string {
  const [{ x, y }] = teselasDelRecuadro(10, info.recuadro as [number, number, number, number]);
  return `/mapabase/t/${info.version}/10/${x}/${y}.pbf`;
}

/**
 * En línea el mapa pinta con teselas sueltas (Pages no sirve rangos) y la descarga sin conexión baja
 * el PMTiles entero (FR-81): los dos tienen que estar en el despliegue.
 *
 * Con reintentos, como la página: si la versión de package.json no cambia, la página ya pasa con el
 * despliegue anterior mientras Pages propaga el nuevo, y la tesela aún sale como la página de la SPA
 * (visto en el primer despliegue de RV-71). Devuelve los problemas del último intento.
 */
export async function comprobarMapabase(
  url: string,
  {
    info = JSON.parse(readFileSync(path.join(RAIZ, 'datos', 'mapabase.json'), 'utf8')) as {
      version: string;
      bytes: number;
      recuadro: number[];
    },
    intentos = 6,
    esperaMs = 10_000,
    pedir = fetch as (u: URL) => Promise<Response>,
  } = {},
): Promise<string[]> {
  const ruta = rutaTeselaDePrueba(info);
  let problemas: string[] = [];
  for (let intento = 1; intento <= intentos; intento++) {
    const t = await pedir(new URL(ruta, url));
    await t.arrayBuffer();
    const a = await pedir(new URL('/mapabase/albolote.pmtiles', url));
    const bytes = (await a.arrayBuffer()).byteLength;
    problemas = comprobarRespuestasMapabase(
      {
        tesela: { ruta, estado: t.status, tipo: t.headers.get('content-type') ?? '' },
        archivo: { estado: a.status, bytes },
      },
      info.bytes,
    );
    if (problemas.length === 0) {
      log.ok(`${url} sirve las teselas sueltas (${ruta}) y el PMTiles entero (${bytes} bytes)`);
      break;
    }
    if (intento < intentos) await new Promise((ok) => setTimeout(ok, esperaMs));
  }
  return problemas;
}

if (import.meta.main) ejecutarScript(principal);
