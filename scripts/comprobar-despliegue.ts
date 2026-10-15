// Tras desplegar: la app responde, sirve la versión esperada, las cabeceras de TR-100 y el mapa base
// (teselas sueltas y PMTiles entero, docs/20 RV-71).
// Solo lectura, sin datos. La usan deploy-staging.yml y deploy-prod.yml, en el trabajo que despliega,
// antes de anunciar la versión del mapa base (RV-21). Solo módulos de Node: corre con `node` y sin
// node_modules (docs/35 RV-410, DEC-198). En staging, con VIGILANCIA_SECRETO, mira también la caché
// de las Functions (comprobar-caches.ts).
//
//   node scripts/comprobar-despliegue.ts --url https://hidrantes-albolote-staging.pages.dev --entorno staging

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, abortar, argumentos, ejecutarScript, log } from './lib/comun.ts';
import { comprobarCaches } from './comprobar-caches.ts';
import { teselasDelRecuadro } from './lib/teselas.ts';

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

  // docs/37 RV-490 (DEC-210): las Functions servidas son las del repositorio, no un _worker.js de dist.
  const funciones = await comprobarFunciones(url);
  if (funciones.length) abortar(`${url}, Functions:\n  - ${funciones.join('\n  - ')}`);
  log.ok(`${url}/api/verificar-codigo responde como las Functions del repositorio`);

  const mapabase = await comprobarMapabase(url);
  if (mapabase.length) abortar(`${url}, mapa base:\n  - ${mapabase.join('\n  - ')}`);

  const secreto = process.env.VIGILANCIA_SECRETO;
  if (entorno === 'staging' && secreto) await comprobarCaches(url, secreto);
}

/** Lo que responde `POST /api/verificar-codigo` con `{}`. */
export interface RespuestaFunciones {
  estado: number;
  tipo: string;
  cuerpo: string;
}

/**
 * docs/37 RV-490 (DEC-210): con `{}`, la Function del repositorio responde exactamente
 * `400 {"error":"PAYLOAD_INVALIDO"}` en JSON, antes de llamar a Supabase y sin contar como intento. Otra
 * respuesta (otro estado, HTML, otro cuerpo) es que no se sirven las Functions del repositorio.
 */
export function comprobarRespuestaFunciones(r: RespuestaFunciones): string[] {
  const problemas: string[] = [];
  if (r.estado !== 400) problemas.push(`verificar-codigo con {} da ${r.estado}, no 400`);
  if (r.tipo.split(';')[0]!.trim() !== 'application/json') {
    problemas.push(`verificar-codigo con {} no responde JSON (${r.tipo || 'sin Content-Type'})`);
  }
  let cuerpo: unknown = null;
  try {
    cuerpo = JSON.parse(r.cuerpo);
  } catch {
    // Se dice abajo: el cuerpo no es el esperado.
  }
  if (JSON.stringify(cuerpo) !== JSON.stringify({ error: 'PAYLOAD_INVALIDO' })) {
    problemas.push('verificar-codigo con {} no responde {"error":"PAYLOAD_INVALIDO"}');
  }
  return problemas;
}

/** El sondeo de RV-412 (avisos-tecnicos.sh), con la respuesta exacta. Sin Origin: llamada de servidor. */
export async function comprobarFunciones(
  url: string,
  { intentos = 3, esperaMs = 10_000, pedir = fetch as typeof fetch } = {},
): Promise<string[]> {
  let problemas: string[] = [];
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      const r = await pedir(new URL('/api/verificar-codigo', url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      problemas = comprobarRespuestaFunciones({
        estado: r.status,
        tipo: r.headers.get('content-type') ?? '',
        cuerpo: await r.text(),
      });
    } catch (e) {
      problemas = [`verificar-codigo no responde: ${e instanceof Error ? e.message : String(e)}`];
    }
    if (problemas.length === 0 || intento === intentos) break;
    await new Promise((ok) => setTimeout(ok, esperaMs));
  }
  return problemas;
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
