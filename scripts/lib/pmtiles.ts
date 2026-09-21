// Escritura de archivos PMTiles v3 (especificación: github.com/protomaps/PMTiles/blob/main/spec/v3).
// Solo lo que necesita el mapa base: un directorio raíz sin hojas, teselas ordenadas por id y sin
// deduplicar. La lectura la hace la librería `pmtiles`; los tests escriben y releen con ella.

import { gzipSync } from 'node:zlib';
import { zxyToTileId } from 'pmtiles';

export const TAMANO_CABECERA = 127;
/** La cabecera y el directorio raíz deben caber en los primeros 16 KiB (spec §3). */
export const MAXIMO_RAIZ = 16_384 - TAMANO_CABECERA;

export interface Tesela {
  z: number;
  x: number;
  y: number;
  /** Bytes tal como vienen del origen (ya comprimidos con `compresionTeselas`). */
  datos: Uint8Array;
}

export interface OpcionesArchivo {
  /** 0 desconocido · 1 ninguna · 2 gzip · 3 brotli · 4 zstd (se copia del origen). */
  compresionTeselas: number;
  /** 1 MVT · 2 png · 3 jpeg · 4 webp · 5 avif. */
  tipoTesela: number;
  minZoom: number;
  maxZoom: number;
  /** [oeste, sur, este, norte] en grados. */
  recuadro: [number, number, number, number];
  metadatos: Record<string, unknown>;
}

function varint(salida: number[], valor: number): void {
  let v = valor;
  while (v >= 0x80) {
    salida.push((v % 0x80) | 0x80);
    v = Math.floor(v / 0x80);
  }
  salida.push(v);
}

interface Entrada {
  tileId: number;
  offset: number;
  length: number;
  runLength: number;
}

/** Directorio serializado según spec §4 (columnas: ids en delta, rachas, longitudes, offsets). */
export function serializarDirectorio(entradas: Entrada[]): Uint8Array {
  const b: number[] = [];
  varint(b, entradas.length);
  let ultimo = 0;
  for (const e of entradas) {
    varint(b, e.tileId - ultimo);
    ultimo = e.tileId;
  }
  for (const e of entradas) varint(b, e.runLength);
  for (const e of entradas) varint(b, e.length);
  entradas.forEach((e, i) => {
    const previo = entradas[i - 1];
    if (i > 0 && e.offset === previo.offset + previo.length) varint(b, 0);
    else varint(b, e.offset + 1);
  });
  return Uint8Array.from(b);
}

function escribirU64(vista: DataView, pos: number, valor: number): void {
  vista.setBigUint64(pos, BigInt(valor), true);
}

const e7 = (grados: number) => Math.round(grados * 1e7);

/** Construye el archivo completo: cabecera · directorio raíz · metadatos · teselas. */
export function escribirPmtiles(teselas: Tesela[], o: OpcionesArchivo): Uint8Array {
  const ordenadas = teselas
    .map((t) => ({ ...t, tileId: zxyToTileId(t.z, t.x, t.y) }))
    .sort((a, b) => a.tileId - b.tileId);

  const entradas: Entrada[] = [];
  let offset = 0;
  for (const t of ordenadas) {
    entradas.push({ tileId: t.tileId, offset, length: t.datos.length, runLength: 1 });
    offset += t.datos.length;
  }
  const raiz = gzipSync(serializarDirectorio(entradas));
  if (raiz.length > MAXIMO_RAIZ) {
    throw new Error(`El directorio raíz ocupa ${raiz.length} bytes y no cabe en 16 KiB: reduce el zoom o el recuadro.`);
  }
  const metadatos = gzipSync(Buffer.from(JSON.stringify(o.metadatos), 'utf8'));

  const inicioRaiz = TAMANO_CABECERA;
  const inicioMeta = inicioRaiz + raiz.length;
  const inicioTeselas = inicioMeta + metadatos.length;
  const total = inicioTeselas + offset;

  const salida = new Uint8Array(total);
  const v = new DataView(salida.buffer);
  salida.set(new TextEncoder().encode('PMTiles'), 0);
  v.setUint8(7, 3);
  escribirU64(v, 8, inicioRaiz);
  escribirU64(v, 16, raiz.length);
  escribirU64(v, 24, inicioMeta);
  escribirU64(v, 32, metadatos.length);
  escribirU64(v, 40, inicioTeselas); // sin directorios hoja
  escribirU64(v, 48, 0);
  escribirU64(v, 56, inicioTeselas);
  escribirU64(v, 64, offset);
  escribirU64(v, 72, entradas.length); // teselas direccionadas
  escribirU64(v, 80, entradas.length); // entradas
  escribirU64(v, 88, entradas.length); // contenidos distintos (sin deduplicar)
  v.setUint8(96, 1); // agrupado: teselas en orden de id
  v.setUint8(97, 2); // directorios y metadatos en gzip
  v.setUint8(98, o.compresionTeselas);
  v.setUint8(99, o.tipoTesela);
  v.setUint8(100, o.minZoom);
  v.setUint8(101, o.maxZoom);
  const [oeste, sur, este, norte] = o.recuadro;
  v.setInt32(102, e7(oeste), true);
  v.setInt32(106, e7(sur), true);
  v.setInt32(110, e7(este), true);
  v.setInt32(114, e7(norte), true);
  v.setUint8(118, Math.min(o.maxZoom, Math.max(o.minZoom, 13)));
  v.setInt32(119, e7((oeste + este) / 2), true);
  v.setInt32(123, e7((sur + norte) / 2), true);

  salida.set(raiz, inicioRaiz);
  salida.set(metadatos, inicioMeta);
  let pos = inicioTeselas;
  for (const t of ordenadas) {
    salida.set(t.datos, pos);
    pos += t.datos.length;
  }
  return salida;
}

/** Teselas (x, y) de un zoom que tocan el recuadro, en la rejilla de Web Mercator. */
export function teselasDelRecuadro(z: number, [oeste, sur, este, norte]: [number, number, number, number]) {
  const n = 2 ** z;
  const x = (lon: number) => Math.min(n - 1, Math.floor(((lon + 180) / 360) * n));
  const y = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.min(n - 1, Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n));
  };
  const lista: { x: number; y: number }[] = [];
  for (let tx = x(oeste); tx <= x(este); tx++) {
    for (let ty = y(norte); ty <= y(sur); ty++) lista.push({ x: tx, y: ty });
  }
  return lista;
}
