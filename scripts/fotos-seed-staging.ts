// Fotos de los puntos y propuestas del seed de staging (docs/33 RV-340, D12 del recorrido).
//
// El seed (supabase/seed-staging.sql) pone a sus puntos y propuestas rutas `fotos/prueba-*.jpg`, pero
// nada subía esas fotos: en staging la ficha decía «No se ha podido cargar la foto» y la consola se
// llenaba de 400. Este script, después del seed, comprueba cada ruta en la URL pública del bucket y
// sube las que faltan: una imagen generada aquí, con «[PRUEBA]» y el nombre del archivo, sin datos
// personales. Después vuelve a comprobarlas todas: cada una tiene que responder 200, o falla.
//
//   npm run fotos-seed                      deploy-staging.yml: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//                                           y SUPABASE_DB_URL del environment staging
//   npm run fotos-seed -- --solo-comprobar  solo mira las URL públicas (sin secretos); falla si falta alguna
//
// Solo staging: el bucket es `hidrantes-fotos-dev` y SUPABASE_URL tiene que ser el proyecto de staging
// (docs/entornos.md). Producción no tiene seed (04 §4) y este script se niega a tocarla.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, REFS, abortar, argumentos, ejecutarScript, log, psqlOk } from './lib/comun.ts';

export const BUCKET_STAGING = 'hidrantes-fotos-dev';
export const URL_STAGING = `https://${REFS.staging}.supabase.co`;

/** Las fotos del seed son siempre `fotos/prueba-<algo>.jpg`; nada más se sube con este script. */
const RUTA_DE_PRUEBA = /^fotos\/prueba-[a-z0-9-]+\.jpg$/;

/** Las rutas de foto que escribe el seed, sacadas del propio archivo, sin repetir y ordenadas. */
export function rutasDelSeed(sql: string): string[] {
  const rutas = new Set<string>();
  for (const m of sql.matchAll(/'(fotos\/prueba-[a-z0-9-]+\.jpg)'/g)) rutas.add(m[1]!);
  return [...rutas].sort();
}

/**
 * Las rutas que tienen hoy en la base las filas del seed (ids `5eed0000-…`): si jefatura aprobó una
 * revisión con foto, la del punto ya es otra, y esa es la que enseña la ficha. Solo las de prueba.
 */
export const SQL_RUTAS_EN_LA_BASE = `
select distinct r from (
  select foto_path as r from hidrantes.puntos where id::text like '5eed0000-%'
  union all select foto_sitio_path from hidrantes.puntos where id::text like '5eed0000-%'
  union all select foto_path from hidrantes.propuestas where id::text like '5eed0000-%'
  union all select foto_sitio_path from hidrantes.propuestas where id::text like '5eed0000-%'
) x where r like 'fotos/prueba-%' order by r;`;

export function urlPublica(base: string, bucket: string, ruta: string): string {
  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/${bucket}/${ruta.split('/').map(encodeURIComponent).join('/')}`;
}

/** Aborta si la URL de Supabase no es la de staging: este script no sube nada a otro proyecto. */
export function comprobarStaging(base: string): void {
  let host: string;
  try {
    host = new URL(base).hostname;
  } catch {
    abortar('SUPABASE_URL no es una URL.');
  }
  if (host !== `${REFS.staging}.supabase.co`) {
    abortar(`SUPABASE_URL apunta a ${host}; las fotos del seed solo van a staging (${REFS.staging}).`);
  }
}

/** El texto que lleva cada foto generada: `fotos/prueba-hid-9001.jpg` → `HID-9001`. */
export function rotulo(ruta: string): string {
  const nombre = path.posix.basename(ruta, '.jpg').replace(/^prueba-/, '');
  // La foto del sitio de un punto (docs/34 RV-354): `prueba-sitio-hid-9003` → `HID-9003 · sitio`.
  const sitio = /^sitio-(hid|boc)-(\d{4})$/.exec(nombre);
  if (sitio) return `${sitio[1]!.toUpperCase()}-${sitio[2]} · sitio`;
  const punto = /^(hid|boc)-(\d{4})$/.exec(nombre);
  if (punto) return `${punto[1]!.toUpperCase()}-${punto[2]}`;
  const propuesta = /^propuesta-([a-z0-9]+)$/.exec(nombre);
  if (propuesta) return `Propuesta ${propuesta[1]}`;
  return nombre;
}

/** Estado HTTP de cada URL pública (0 si no responde). */
export async function estados(
  base: string,
  bucket: string,
  rutas: string[],
  pedir: typeof fetch = fetch,
): Promise<Map<string, number>> {
  const r = new Map<string, number>();
  for (const ruta of rutas) {
    const resp = await pedir(urlPublica(base, bucket, ruta), { method: 'GET', cache: 'no-store' }).catch(() => null);
    // El cuerpo no interesa; se consume para liberar la conexión.
    await resp?.arrayBuffer().catch(() => undefined);
    r.set(ruta, resp?.status ?? 0);
  }
  return r;
}

export const faltan = (e: Map<string, number>): string[] => [...e].filter(([, s]) => s !== 200).map(([r]) => r);

/** JPEG de 1200 × 900 generado en Chromium (lo instala el paso `navegadores` del workflow). */
export async function generarFotos(rutas: string[]): Promise<Map<string, Buffer>> {
  const { chromium } = await import('@playwright/test');
  const navegador = await chromium.launch({ channel: process.env.PW_CANAL || undefined });
  try {
    const pagina = await navegador.newPage();
    const fotos = new Map<string, Buffer>();
    for (const ruta of rutas) {
      const texto = rotulo(ruta);
      const base64 = await pagina.evaluate(async (t: string) => {
        const c = document.createElement('canvas');
        c.width = 1200;
        c.height = 900;
        const g = c.getContext('2d')!;
        g.fillStyle = t.startsWith('BOC') ? '#1e5a8a' : t.startsWith('HID') ? '#a3261f' : '#4a4a4a';
        g.fillRect(0, 0, 1200, 900);
        g.fillStyle = '#ffffff';
        g.textAlign = 'center';
        g.font = 'bold 120px sans-serif';
        g.fillText('[PRUEBA]', 600, 360);
        g.font = 'bold 96px sans-serif';
        g.fillText(t, 600, 500);
        g.font = '48px sans-serif';
        g.fillText('Foto de prueba de staging', 600, 620);
        const blob = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), 'image/jpeg', 0.7));
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let s = '';
        for (const b of bytes) s += String.fromCharCode(b);
        return btoa(s);
      }, texto);
      fotos.set(ruta, Buffer.from(base64, 'base64'));
    }
    return fotos;
  } finally {
    await navegador.close();
  }
}

async function subir(base: string, servicio: string, bucket: string, ruta: string, foto: Buffer): Promise<void> {
  const r = await fetch(`${base.replace(/\/+$/, '')}/storage/v1/object/${bucket}/${ruta}`, {
    method: 'POST',
    headers: {
      apikey: servicio,
      Authorization: `Bearer ${servicio}`,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
    },
    body: new Uint8Array(foto),
  }).catch((e: unknown) =>
    abortar(`No se pudo contactar con Storage al subir ${ruta}: ${e instanceof Error ? e.message : String(e)}`),
  );
  // El cuerpo de un error de Storage dice el motivo (bucket, clave, tipo); no lleva secretos.
  if (!r.ok)
    abortar(`Storage respondió ${r.status} al subir ${ruta}: ${(await r.text().catch(() => '')).slice(0, 300)}`);
}

async function principal(): Promise<void> {
  const { banderas, valores } = argumentos();
  const soloComprobar = banderas.has('solo-comprobar');
  // `||` y no `??`: un secreto que falta llega a Actions como cadena vacía.
  const base = valores.get('url') || process.env.SUPABASE_URL || (soloComprobar ? URL_STAGING : '');
  if (!base) abortar('Falta SUPABASE_URL (la del environment staging).');
  comprobarStaging(base);

  const rutas = new Set(rutasDelSeed(readFileSync(path.join(RAIZ, 'supabase', 'seed-staging.sql'), 'utf8')));
  const bd = process.env.SUPABASE_DB_URL || '';
  if (bd) {
    for (const r of psqlOk(bd, SQL_RUTAS_EN_LA_BASE, { tuplas: true }).split('\n')) {
      if (r.trim()) rutas.add(r.trim());
    }
  } else if (!soloComprobar) {
    abortar('Falta SUPABASE_DB_URL (la del environment staging).');
  }
  const lista = [...rutas].filter((r) => RUTA_DE_PRUEBA.test(r)).sort();
  if (lista.length === 0) abortar('No hay ninguna foto del seed que comprobar: ¿ha cambiado seed-staging.sql?');

  log.paso(`Fotos del seed de staging: ${lista.length} rutas en ${BUCKET_STAGING}`);
  let antes = await estados(base, BUCKET_STAGING, lista);
  let pendientes = faltan(antes);
  log.info(`Responden 200: ${lista.length - pendientes.length}; faltan: ${pendientes.length}`);

  if (pendientes.length > 0 && !soloComprobar) {
    const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY || abortar('Falta SUPABASE_SERVICE_ROLE_KEY.');
    const fotos = await generarFotos(pendientes);
    for (const ruta of pendientes) {
      await subir(base, servicio, BUCKET_STAGING, ruta, fotos.get(ruta)!);
      log.ok(`Subida ${ruta}`);
    }
    antes = await estados(base, BUCKET_STAGING, lista);
    pendientes = faltan(antes);
  }

  if (pendientes.length > 0) {
    for (const ruta of pendientes) log.error(`${ruta}: ${antes.get(ruta) || 'sin respuesta'}`);
    abortar(`${pendientes.length} fotos del seed no responden 200 en staging.`);
  }
  log.ok(`Las ${lista.length} fotos del seed responden 200.`);
}

if (import.meta.main) ejecutarScript(principal);
