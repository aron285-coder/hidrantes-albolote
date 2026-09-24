// npm run mapabase: mapa base propio de Albolote y Calicasas (04 §8, FR-81).
//
// Lee por rangos una compilación diaria pública de Protomaps (datos OpenStreetMap, ODbL) sin
// descargar el planeta, se queda con las teselas del recuadro de la zona de cobertura
// (datos/meta.json) de los zooms 10 a 15 y escribe un PMTiles propio. Sin binarios externos: la
// lectura la hace la librería `pmtiles` y la escritura scripts/lib/pmtiles.ts.
//
//   npm run mapabase                        compilación más reciente de los últimos 10 días
//   npm run mapabase -- --build 20260918    una concreta
//   npm run mapabase -- --solo-teselas      solo las teselas sueltas, del PMTiles ya publicado
//
// Escribe public/mapabase/albolote.pmtiles (se sirve con el despliegue si pesa ≤ 20 MB) y
// datos/mapabase.json con la versión, que la app compara con lo que el móvil tiene descargado.
//
// Además escribe las mismas teselas sueltas en public/mapabase/t/<versión>/{z}/{x}/{y}.pbf, sin
// comprimir, más meta.json (docs/20 RV-71, DEC-111): Cloudflare Pages no sirve rangos, así que en
// línea el mapa pide teselas sueltas y el PMTiles entero queda solo para la descarga sin conexión.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { FetchSource, PMTiles, type Source } from 'pmtiles';
import { RAIZ, abortar, ejecutarScript, log } from './lib/comun.ts';
import { type Tesela, escribirPmtiles, teselasDelRecuadro } from './lib/pmtiles.ts';

const ORIGEN = 'https://build.protomaps.com';
const ZOOM_MIN = 10;
const ZOOM_MAX = 15;
const LIMITE_PAGES = 20 * 1024 * 1024;
const EN_PARALELO = 8;

const SALIDA = path.join(RAIZ, 'public', 'mapabase', 'albolote.pmtiles');
const INFO = path.join(RAIZ, 'datos', 'mapabase.json');
export const CARPETA_TESELAS = path.join(RAIZ, 'public', 'mapabase', 't');

/**
 * Topes de las teselas sueltas (DEC-111). Pages admite 20.000 archivos por despliegue y el resto de
 * la app son unas decenas: 5.000 deja margen para cuatro veces el recuadro actual. 15 MB sin
 * comprimir es unas tres veces lo que ocupan hoy.
 */
export const TOPES_TESELAS = { archivos: 5_000, bytes: 15 * 1024 * 1024 };

export interface OpcionesTeselas {
  version: string;
  zoom: [number, number];
  /** [oeste, sur, este, norte] en grados, el de datos/mapabase.json. */
  recuadro: [number, number, number, number];
  carpeta?: string;
  topes?: { archivos: number; bytes: number };
}

export interface ResumenTeselas {
  version: string;
  zoom: [number, number];
  recuadro: [number, number, number, number];
  /** Archivos .pbf escritos: uno por tesela del recuadro, vacío si no tiene datos. */
  teselas: number;
  conDatos: number;
  bytes: number;
}

/** Origen en memoria para leer un PMTiles ya cargado con la librería oficial. */
function enMemoria(bytes: Uint8Array): Source {
  return {
    getKey: () => 'memoria',
    getBytes: async (offset, length) => ({ data: bytes.slice(offset, offset + length).buffer as ArrayBuffer }),
  };
}

/**
 * Escribe cada tesela del recuadro en `<carpeta>/<versión>/{z}/{x}/{y}.pbf`, descomprimida (la app no
 * depende de `Content-Encoding`), y `meta.json`. Una tesela sin datos se escribe vacía, que es un MVT
 * válido: así ninguna petición del recuadro cae en la página de la SPA que Pages sirve con 200 para lo
 * que no existe. Borra antes las carpetas de otras versiones y no escribe nada si se pasa de los topes.
 */
export async function escribirTeselas(archivo: Uint8Array, o: OpcionesTeselas): Promise<ResumenTeselas> {
  if (!/^[\w.-]+$/.test(o.version)) abortar(`Versión del mapa base no válida para una carpeta: "${o.version}".`);
  const carpeta = o.carpeta ?? CARPETA_TESELAS;
  const topes = o.topes ?? TOPES_TESELAS;
  const pm = new PMTiles(enMemoria(archivo));
  const [zMin, zMax] = o.zoom;

  const salida: { ruta: string; datos: Uint8Array }[] = [];
  let bytes = 0;
  let conDatos = 0;
  for (let z = zMin; z <= zMax; z++) {
    for (const { x, y } of teselasDelRecuadro(z, o.recuadro)) {
      const r = await pm.getZxy(z, x, y);
      const datos = r ? new Uint8Array(r.data) : new Uint8Array(0);
      if (datos.length > 0) conDatos++;
      bytes += datos.length;
      salida.push({ ruta: path.join(String(z), String(x), `${y}.pbf`), datos });
      if (salida.length > topes.archivos) {
        abortar(`Salen más de ${topes.archivos} teselas sueltas: reduce el zoom o el recuadro (DEC-111).`);
      }
    }
  }
  if (bytes > topes.bytes) {
    abortar(
      `Las teselas sueltas ocupan ${(bytes / 1024 / 1024).toFixed(1)} MB, más de ${(topes.bytes / 1024 / 1024).toFixed(0)} MB (DEC-111).`,
    );
  }

  // Una versión nueva nunca mezcla teselas viejas: se borra todo lo anterior.
  if (existsSync(carpeta)) rmSync(carpeta, { recursive: true, force: true });
  const destino = path.join(carpeta, o.version);
  for (const t of salida) {
    const ruta = path.join(destino, t.ruta);
    mkdirSync(path.dirname(ruta), { recursive: true });
    writeFileSync(ruta, t.datos);
  }
  const resumen: ResumenTeselas = {
    version: o.version,
    zoom: o.zoom,
    recuadro: o.recuadro,
    teselas: salida.length,
    conDatos,
    bytes,
  };
  writeFileSync(path.join(destino, 'meta.json'), JSON.stringify(resumen, null, 2) + '\n');
  return resumen;
}

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const fecha = (d: Date) => d.toISOString().slice(0, 10).replaceAll('-', '');

async function compilacionReciente(): Promise<string> {
  const hoy = new Date();
  for (let dias = 0; dias < 10; dias++) {
    const d = new Date(hoy.getTime() - dias * 86_400_000);
    const r = await fetch(`${ORIGEN}/${fecha(d)}.pmtiles`, { method: 'HEAD' });
    if (r.ok) return fecha(d);
  }
  return abortar('No hay compilaciones de Protomaps en los últimos 10 días. Indica una con --build AAAAMMDD.');
}

async function teselasSueltas(archivo: Uint8Array, info: Omit<OpcionesTeselas, 'carpeta' | 'topes'>) {
  log.paso(`Teselas sueltas para el mapa en línea (versión ${info.version})`);
  const r = await escribirTeselas(archivo, info);
  log.ok(
    `${path.relative(RAIZ, path.join(CARPETA_TESELAS, r.version))} · ${r.teselas} archivos (${r.conDatos} con datos) · ${(r.bytes / 1024 / 1024).toFixed(1)} MB`,
  );
}

/** --solo-teselas: del PMTiles ya publicado, sin tocar la versión ni pedir nada a Protomaps. */
async function soloTeselas() {
  const info = JSON.parse(readFileSync(INFO, 'utf8'));
  const archivo = new Uint8Array(readFileSync(SALIDA));
  if (archivo.length !== info.bytes) {
    abortar(`${path.relative(RAIZ, SALIDA)} pesa ${archivo.length} bytes y datos/mapabase.json dice ${info.bytes}.`);
  }
  await teselasSueltas(archivo, { version: info.version, zoom: info.zoom, recuadro: info.recuadro });
}

async function principal() {
  if (process.argv.includes('--solo-teselas')) return soloTeselas();

  const meta = JSON.parse(readFileSync(path.join(RAIZ, 'datos', 'meta.json'), 'utf8'));
  const recuadro = meta.recuadro as [number, number, number, number];
  if (!Array.isArray(recuadro) || recuadro.length !== 4) abortar('datos/meta.json no tiene recuadro: npm run zona.');

  log.paso('Compilación de origen');
  const build = argumento('build') ?? (await compilacionReciente());
  const origen = new PMTiles(new FetchSource(`${ORIGEN}/${build}.pmtiles`));
  const cabecera = await origen.getHeader();
  if (cabecera.tileType !== 1)
    abortar(`La compilación ${build} no es de teselas vectoriales (tipo ${cabecera.tileType}).`);
  log.ok(`${build} · zoom ${cabecera.minZoom}–${cabecera.maxZoom}`);

  log.paso(`Teselas del recuadro, zoom ${ZOOM_MIN}–${ZOOM_MAX}`);
  const pendientes: { z: number; x: number; y: number }[] = [];
  for (let z = ZOOM_MIN; z <= Math.min(ZOOM_MAX, cabecera.maxZoom); z++) {
    for (const { x, y } of teselasDelRecuadro(z, recuadro)) pendientes.push({ z, x, y });
  }
  const teselas: Tesela[] = [];
  let hechas = 0;
  async function trabajador() {
    for (let t = pendientes.shift(); t; t = pendientes.shift()) {
      const r = await origen.getZxy(t.z, t.x, t.y);
      // La librería entrega la tesela descomprimida; se guarda otra vez en gzip.
      if (r) teselas.push({ ...t, datos: gzipSync(new Uint8Array(r.data), { level: 9 }) });
      if (++hechas % 50 === 0) log.info(`${hechas} teselas…`);
    }
  }
  const total = pendientes.length;
  await Promise.all(Array.from({ length: EN_PARALELO }, trabajador));
  log.ok(`${teselas.length} de ${total} teselas con datos`);

  const zoom: [number, number] = [ZOOM_MIN, Math.min(ZOOM_MAX, cabecera.maxZoom)];
  const metadatosOrigen = (await origen.getMetadata()) as Record<string, unknown>;
  const archivo = escribirPmtiles(teselas, {
    compresionTeselas: 2,
    tipoTesela: 1,
    minZoom: zoom[0],
    maxZoom: zoom[1],
    recuadro,
    metadatos: {
      ...metadatosOrigen,
      name: 'Mapa base · Albolote y Calicasas',
      attribution: '© OpenStreetMap contributors',
      hidrantes: { build, generado: new Date().toISOString() },
    },
  });

  // Primero las teselas sueltas: si se pasan de los topes, no se deja un PMTiles nuevo sin ellas.
  await teselasSueltas(archivo, { version: build, zoom, recuadro });

  mkdirSync(path.dirname(SALIDA), { recursive: true });
  writeFileSync(SALIDA, archivo);
  const mb = archivo.length / 1024 / 1024;
  writeFileSync(
    INFO,
    JSON.stringify(
      {
        version: build,
        bytes: archivo.length,
        zoom,
        recuadro,
        fuente: 'Protomaps (OpenStreetMap, ODbL)',
      },
      null,
      2,
    ) + '\n',
  );
  log.ok(`${path.relative(RAIZ, SALIDA)} · ${mb.toFixed(1)} MB · versión ${build}`);
  if (archivo.length > LIMITE_PAGES) {
    log.aviso('Pesa más de 20 MB: va a R2 (04 §8). Sube el archivo al bucket y fija VITE_MAPABASE_URL.');
  }
}

if (import.meta.main) ejecutarScript(principal);
