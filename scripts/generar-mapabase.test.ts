// Teselas sueltas del mapa base (docs/20 RV-71, DEC-111): Cloudflare Pages no sirve rangos, así que en
// línea el mapa pide {z}/{x}/{y}.pbf. Se sacan del PMTiles, descomprimidas, en la carpeta de su versión.
// El PMTiles de ejemplo se construye en memoria con scripts/lib/pmtiles.ts: detectar-secretos no deja
// subir más .pmtiles que el publicado.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CARPETA_TESELAS, TOPES_TESELAS, escribirTeselas } from './generar-mapabase.ts';
import { escribirPmtiles, teselasDelRecuadro } from './lib/pmtiles.ts';

const info = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '..', 'datos', 'mapabase.json'), 'utf8'));

const RECUADRO: [number, number, number, number] = [-3.66, 37.23, -3.645, 37.24];
const ZOOM: [number, number] = [12, 13];

/** Contenido reconocible por tesela: así se ve que cada una va a su ruta. */
const contenido = (z: number, x: number, y: number) => Buffer.from(`mvt ${z}/${x}/${y}`);

function ejemplo({ sinDatos = [] as string[] } = {}) {
  const teselas = [];
  for (let z = ZOOM[0]; z <= ZOOM[1]; z++) {
    for (const { x, y } of teselasDelRecuadro(z, RECUADRO)) {
      if (sinDatos.includes(`${z}/${x}/${y}`)) continue;
      teselas.push({ z, x, y, datos: gzipSync(contenido(z, x, y)) });
    }
  }
  const archivo = escribirPmtiles(teselas, {
    compresionTeselas: 2,
    tipoTesela: 1,
    minZoom: ZOOM[0],
    maxZoom: ZOOM[1],
    recuadro: RECUADRO,
    metadatos: { name: 'ejemplo' },
  });
  return { archivo, total: teselas.length + sinDatos.length };
}

let carpeta: string;
beforeEach(() => {
  carpeta = mkdtempSync(path.join(tmpdir(), 'teselas-'));
});
afterEach(() => rmSync(carpeta, { recursive: true, force: true }));

const pbfs = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.pbf'))
    .map((f) => f.replaceAll('\\', '/'))
    .sort();

describe('teselas sueltas del PMTiles (RV-71)', () => {
  it('cada tesela del recuadro, en {versión}/{z}/{x}/{y}.pbf y descomprimida', async () => {
    const { archivo, total } = ejemplo();
    const r = await escribirTeselas(archivo, { version: '20260101', zoom: ZOOM, recuadro: RECUADRO, carpeta });
    const escritas = pbfs(path.join(carpeta, '20260101'));
    expect(escritas).toHaveLength(total);
    expect(r).toMatchObject({ version: '20260101', teselas: total, conDatos: total });
    for (let z = ZOOM[0]; z <= ZOOM[1]; z++) {
      for (const { x, y } of teselasDelRecuadro(z, RECUADRO)) {
        const datos = readFileSync(path.join(carpeta, '20260101', String(z), String(x), `${y}.pbf`));
        // Sin gzip: la app no depende de Content-Encoding.
        expect(datos.equals(contenido(z, x, y))).toBe(true);
      }
    }
  });

  it('una tesela sin datos se escribe vacía: nunca cae en la página de la SPA', async () => {
    const [primera] = teselasDelRecuadro(13, RECUADRO);
    const { archivo, total } = ejemplo({ sinDatos: [`13/${primera.x}/${primera.y}`] });
    const r = await escribirTeselas(archivo, { version: 'v1', zoom: ZOOM, recuadro: RECUADRO, carpeta });
    expect(r.teselas).toBe(total);
    expect(r.conDatos).toBe(total - 1);
    expect(readFileSync(path.join(carpeta, 'v1', '13', String(primera.x), `${primera.y}.pbf`))).toHaveLength(0);
  });

  it('meta.json dice zooms, recuadro y número de teselas', async () => {
    const { archivo, total } = ejemplo();
    await escribirTeselas(archivo, { version: 'v1', zoom: ZOOM, recuadro: RECUADRO, carpeta });
    const meta = JSON.parse(readFileSync(path.join(carpeta, 'v1', 'meta.json'), 'utf8'));
    expect(meta).toMatchObject({ version: 'v1', zoom: ZOOM, recuadro: RECUADRO, teselas: total, conDatos: total });
    expect(meta.bytes).toBeGreaterThan(0);
  });

  it('borra las carpetas de versiones anteriores', async () => {
    mkdirSync(path.join(carpeta, 'vieja', '12', '1'), { recursive: true });
    writeFileSync(path.join(carpeta, 'vieja', '12', '1', '2.pbf'), 'x');
    await escribirTeselas(ejemplo().archivo, { version: 'nueva', zoom: ZOOM, recuadro: RECUADRO, carpeta });
    expect(readdirSync(carpeta)).toEqual(['nueva']);
  });

  it('con más archivos que el tope falla y no escribe nada', async () => {
    const { archivo, total } = ejemplo();
    const opciones = {
      version: 'v1',
      zoom: ZOOM,
      recuadro: RECUADRO,
      carpeta,
      topes: { archivos: total - 1, bytes: 1e9 },
    };
    await expect(escribirTeselas(archivo, opciones)).rejects.toThrow(/Salen más de/);
    expect(readdirSync(carpeta)).toEqual([]);
  });

  it('con más bytes que el tope falla y no escribe nada', async () => {
    const opciones = { version: 'v1', zoom: ZOOM, recuadro: RECUADRO, carpeta, topes: { archivos: 1e6, bytes: 10 } };
    await expect(escribirTeselas(ejemplo().archivo, opciones)).rejects.toThrow(/ocupan/);
    expect(readdirSync(carpeta)).toEqual([]);
  });

  it('los topes son 5.000 archivos y 15 MB (DEC-111)', () => {
    expect(TOPES_TESELAS).toEqual({ archivos: 5_000, bytes: 15 * 1024 * 1024 });
  });

  it('una versión con barras no puede escribir fuera de la carpeta', async () => {
    const opciones = { version: '../fuera', zoom: ZOOM, recuadro: RECUADRO, carpeta };
    await expect(escribirTeselas(ejemplo().archivo, opciones)).rejects.toThrow(/no válida/);
  });
});

describe('las teselas publicadas y la app cuentan igual (RV-71)', () => {
  const recuadro = info.recuadro as [number, number, number, number];
  const publicadas = path.join(CARPETA_TESELAS, info.version);

  it('la carpeta publicada es la de la versión de datos/mapabase.json, y solo esa', () => {
    expect(existsSync(path.join(publicadas, 'meta.json'))).toBe(true);
    expect(readdirSync(CARPETA_TESELAS)).toEqual([info.version]);
  });

  it('hay un .pbf por cada tesela que la app pedirá, y ninguno más', () => {
    const esperadas: string[] = [];
    for (let z = info.zoom[0]; z <= info.zoom[1]; z++) {
      for (const { x, y } of teselasDelRecuadro(z, recuadro)) esperadas.push(`${z}/${x}/${y}.pbf`);
    }
    expect(pbfs(publicadas)).toEqual(esperadas.sort());
    const meta = JSON.parse(readFileSync(path.join(publicadas, 'meta.json'), 'utf8'));
    expect(meta.teselas).toBe(esperadas.length);
  });
  // Que la app pida justo estas lo comprueba src/lib/mapabase.test.ts (teselaEnMapabase).
});
