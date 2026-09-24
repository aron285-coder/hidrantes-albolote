// Tras desplegar: la app responde, sirve la versión esperada, las cabeceras de TR-100 y el mapa base
// (teselas sueltas y PMTiles entero, docs/20 RV-71).
// Solo lectura, sin datos. La usan deploy-staging.yml y deploy-prod.yml.
//
//   npm run comprobar-despliegue -- --url https://hidrantes-albolote-staging.pages.dev --entorno staging

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, abortar, argumentos, ejecutarScript, log } from './lib/comun.ts';
import { teselasDelRecuadro } from './lib/pmtiles.ts';

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

  await comprobarMapabase(url);

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
 */
async function comprobarMapabase(url: string): Promise<void> {
  const info = JSON.parse(readFileSync(path.join(RAIZ, 'datos', 'mapabase.json'), 'utf8'));
  const ruta = rutaTeselaDePrueba(info);
  const t = await fetch(new URL(ruta, url));
  await t.arrayBuffer();
  const a = await fetch(new URL('/mapabase/albolote.pmtiles', url));
  const bytes = (await a.arrayBuffer()).byteLength;
  const problemas = comprobarRespuestasMapabase(
    {
      tesela: { ruta, estado: t.status, tipo: t.headers.get('content-type') ?? '' },
      archivo: { estado: a.status, bytes },
    },
    info.bytes,
  );
  if (problemas.length) abortar(`${url}, mapa base:\n  - ${problemas.join('\n  - ')}`);
  log.ok(`${url} sirve las teselas sueltas (${ruta}) y el PMTiles entero (${bytes} bytes)`);
}

/** Qué dice la segunda de dos peticiones iguales (docs/19 RV-63). */
export function estadoCache(segunda: string | null): 'funciona' | 'no_funciona' | 'sin_dato' {
  if (segunda === 'hit') return 'funciona';
  return segunda === 'miss' ? 'no_funciona' : 'sin_dato';
}

/**
 * Dos peticiones iguales a /api/geocodificar y a /api/direccion con el secreto de vigilancia: la
 * segunda tiene que salir de la caché (`x-hidrantes-cache: hit`). En *.pages.dev la Cache API puede
 * no guardar nada; entonces se avisa, sin tirar el despliegue, porque la protección real es el tope
 * por token de las Functions (DEC-092, RV-63).
 */
async function comprobarCaches(url: string, secreto: string): Promise<void> {
  const pedir = (ruta: string, init: RequestInit = {}) =>
    fetch(new URL(ruta, url), { ...init, headers: { 'X-Vigilancia': secreto, ...(init.headers ?? {}) } })
      .then((r) => r.headers.get('x-hidrantes-cache'))
      .catch(() => null);
  const casos: [string, () => Promise<string | null>][] = [
    [
      '/api/geocodificar',
      () =>
        pedir('/api/geocodificar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: 'calle real 1' }),
        }),
    ],
    ['/api/direccion', () => pedir('/api/direccion?lat=37.2309&lng=-3.6558')],
  ];
  for (const [ruta, peticion] of casos) {
    await peticion();
    const estado = estadoCache(await peticion());
    if (estado === 'funciona') log.ok(`${ruta}: la segunda petición igual sale de la caché`);
    else {
      const texto = `${ruta}: la segunda petición igual ${estado === 'no_funciona' ? 'no sale de la caché' : 'no dice si sale de la caché'}. La protección real es el tope de 30 por minuto y token (DEC-092, docs/19 RV-63).`;
      if (process.env.CI) console.log(`::warning::${texto}`);
      log.aviso(texto);
    }
  }
}

if (import.meta.main) ejecutarScript(principal);
