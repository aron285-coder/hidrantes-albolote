// Fotos de referencia del racor (FR-20, docs/24 RV-104, docs/29 RV-121). Toma las fotos originales del
// desarrollador de una carpeta, las recorta en cuadrado al centro, las reduce a 160 × 160 px y las
// guarda en WebP de ≤ 25 kB en public/racores/. Usa el Chromium de Playwright, como
// generar-iconos.ts: sin dependencias nuevas.
//
//   npx tsx scripts/preparar-racores.ts <carpeta-con-las-fotos> [granada|barcelona|directo …]
//
// En la carpeta, un archivo por racor cuyo nombre empiece por «granada», «barcelona» o «directo»
// (JPEG, PNG o WebP; p. ej. granada.jpg). Sin lista, los tres; con lista, solo esos (p. ej.
// `… <carpeta> directo` para poner la de Directo sin rehacer las otras dos). Nunca imágenes sacadas de internet: fotos propias, porque
// el repositorio es público. En local sin Chromium descargado: PW_CANAL=chrome.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Page, chromium } from '@playwright/test';

export const LADO = 160;
export const MAXIMO_BYTES = 25 * 1024;
export const RACORES = ['granada', 'barcelona', 'directo'] as const;
export type RacorConFoto = (typeof RACORES)[number];

const esRacor = (r: string): r is RacorConFoto => (RACORES as readonly string[]).includes(r);
const TIPOS: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/** La foto original de cada racor pedido en la carpeta; error claro si falta alguna. */
export function buscarOriginales(
  carpeta: string,
  racores: readonly RacorConFoto[] = RACORES,
): Partial<Record<RacorConFoto, string>> {
  const archivos = readdirSync(carpeta);
  const encontrados: Partial<Record<RacorConFoto, string>> = {};
  for (const racor of racores) {
    const candidatos = archivos.filter(
      (a) => a.toLowerCase().startsWith(racor) && TIPOS[path.extname(a).toLowerCase()],
    );
    if (candidatos.length === 0)
      throw new Error(`Falta la foto de ${racor} en ${carpeta} (${racor}.jpg, .png o .webp)`);
    // Con dos candidatas, cuál se usaría dependería del orden de la carpeta: mejor decirlo.
    if (candidatos.length > 1) throw new Error(`Hay más de una foto de ${racor}: ${candidatos.join(', ')}. Deja una.`);
    encontrados[racor] = path.join(carpeta, candidatos[0]);
  }
  return encontrados;
}

/**
 * Recorta en cuadrado al centro, reduce a 160 × 160 y codifica en WebP bajando la calidad hasta
 * que quepa en 25 kB. Devuelve los bytes del WebP.
 */
export async function prepararFoto(pagina: Page, original: Buffer, tipo: string): Promise<Buffer> {
  const base64 = await pagina.evaluate(
    async ({ datos, tipo, lado, maximo }) => {
      const blob = await (await fetch(`data:${tipo};base64,${datos}`)).blob();
      const img = await createImageBitmap(blob);
      const corte = Math.min(img.width, img.height);
      const lienzo = document.createElement('canvas');
      lienzo.width = lado;
      lienzo.height = lado;
      const ctx = lienzo.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (img.width - corte) / 2, (img.height - corte) / 2, corte, corte, 0, 0, lado, lado);
      for (let calidad = 0.9; calidad >= 0.3; calidad -= 0.1) {
        const salida = await new Promise<Blob | null>((r) => lienzo.toBlob(r, 'image/webp', calidad));
        if (!salida) throw new Error('El navegador no ha podido codificar la imagen');
        if (salida.type !== 'image/webp') throw new Error('El navegador no codifica WebP');
        if (salida.size <= maximo) {
          const bytes = new Uint8Array(await salida.arrayBuffer());
          let binario = '';
          for (const b of bytes) binario += String.fromCharCode(b);
          return btoa(binario);
        }
      }
      throw new Error(`No cabe en ${Math.round(maximo / 1024)} kB ni con la calidad más baja`);
    },
    { datos: original.toString('base64'), tipo, lado: LADO, maximo: MAXIMO_BYTES },
  );
  return Buffer.from(base64, 'base64');
}

/**
 * Prepara las fotos pedidas de `carpeta` (sin lista, las tres) y las escribe en `salida`. Devuelve
 * las rutas escritas. Primero las codifica todas y solo después escribe: si una falla, no queda
 * ninguna a medias (la app enseñaría foto en un botón y en otro no).
 */
export async function prepararRacores(
  carpeta: string,
  salida: string,
  pagina: Page,
  racores: readonly RacorConFoto[] = RACORES,
): Promise<string[]> {
  const originales = buscarOriginales(carpeta, racores);
  const preparadas: [string, Buffer][] = [];
  for (const racor of racores) {
    // buscarOriginales ya ha lanzado si faltaba alguna de las pedidas.
    const origen = originales[racor]!;
    try {
      const webp = await prepararFoto(pagina, readFileSync(origen), TIPOS[path.extname(origen).toLowerCase()]);
      preparadas.push([path.join(salida, `${racor}.webp`), webp]);
    } catch (e) {
      throw new Error(`No se ha podido preparar ${origen}: ${e instanceof Error ? e.message : String(e)}`, {
        cause: e,
      });
    }
  }
  mkdirSync(salida, { recursive: true });
  for (const [destino, webp] of preparadas) writeFileSync(destino, webp);
  return preparadas.map(([destino]) => destino);
}

async function principal() {
  const [carpeta, ...pedidos] = process.argv.slice(2);
  if (!carpeta)
    throw new Error('Uso: npx tsx scripts/preparar-racores.ts <carpeta-con-las-fotos> [granada|barcelona|directo …]');
  const desconocidos = pedidos.filter((r) => !esRacor(r));
  if (desconocidos.length) throw new Error(`No conozco ${desconocidos.join(', ')}: elige entre ${RACORES.join(', ')}.`);
  const racores = pedidos.length ? pedidos.filter(esRacor) : RACORES;
  const navegador = await chromium.launch({ channel: process.env.PW_CANAL || undefined });
  try {
    const pagina = await navegador.newPage();
    const salida = path.resolve(import.meta.dirname, '../public/racores');
    for (const destino of await prepararRacores(path.resolve(carpeta), salida, pagina, racores)) {
      console.log(`✓ ${path.relative(process.cwd(), destino)} (${readFileSync(destino).length} bytes)`);
    }
  } finally {
    await navegador.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await principal();
