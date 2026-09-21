// npm run mapabase: mapa base propio de Albolote y Calicasas (04 §8, FR-81).
//
// Lee por rangos una compilación diaria pública de Protomaps (datos OpenStreetMap, ODbL) sin
// descargar el planeta, se queda con las teselas del recuadro de la zona de cobertura
// (datos/meta.json) de los zooms 10 a 15 y escribe un PMTiles propio. Sin binarios externos: la
// lectura la hace la librería `pmtiles` y la escritura scripts/lib/pmtiles.ts.
//
//   npm run mapabase                      compilación más reciente de los últimos 10 días
//   npm run mapabase -- --build 20260918  una concreta
//
// Escribe public/mapabase/albolote.pmtiles (se sirve con el despliegue si pesa ≤ 20 MB) y
// datos/mapabase.json con la versión, que la app compara con lo que el móvil tiene descargado.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { FetchSource, PMTiles } from 'pmtiles';
import { RAIZ, abortar, ejecutarScript, log } from './lib/comun.ts';
import { type Tesela, escribirPmtiles, teselasDelRecuadro } from './lib/pmtiles.ts';

const ORIGEN = 'https://build.protomaps.com';
const ZOOM_MIN = 10;
const ZOOM_MAX = 15;
const LIMITE_PAGES = 20 * 1024 * 1024;
const EN_PARALELO = 8;

const SALIDA = path.join(RAIZ, 'public', 'mapabase', 'albolote.pmtiles');
const INFO = path.join(RAIZ, 'datos', 'mapabase.json');

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

async function principal() {
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

  const metadatosOrigen = (await origen.getMetadata()) as Record<string, unknown>;
  const archivo = escribirPmtiles(teselas, {
    compresionTeselas: 2,
    tipoTesela: 1,
    minZoom: ZOOM_MIN,
    maxZoom: Math.min(ZOOM_MAX, cabecera.maxZoom),
    recuadro,
    metadatos: {
      ...metadatosOrigen,
      name: 'Mapa base · Albolote y Calicasas',
      attribution: '© OpenStreetMap contributors',
      hidrantes: { build, generado: new Date().toISOString() },
    },
  });

  mkdirSync(path.dirname(SALIDA), { recursive: true });
  writeFileSync(SALIDA, archivo);
  const mb = archivo.length / 1024 / 1024;
  writeFileSync(
    INFO,
    JSON.stringify(
      {
        version: build,
        bytes: archivo.length,
        zoom: [ZOOM_MIN, Math.min(ZOOM_MAX, cabecera.maxZoom)],
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

ejecutarScript(principal);
