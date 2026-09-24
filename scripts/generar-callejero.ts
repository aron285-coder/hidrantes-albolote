// Genera el callejero sin conexión desde OpenStreetMap (FR-73, TR-77, TR-117, DEC-093, docs/18 GM-04).
//
//   npm run callejero
//
// Escribe (los dos se committean; el build nunca depende de Overpass):
//   public/callejero.json   calles, lugares y equipamientos con nombre de la zona, ≤ 200 kB; la app
//                           lo descarga la primera vez que se busca y el Service Worker lo precachea
//   datos/callejero.json    versión y recuento, para Salud del sistema (cargar-version-mapabase.ts)
//
// Solo a mano o en Mantenimiento, al regenerar la zona o el mapa base (FR-165). Si Overpass falla,
// el callejero committeado sigue valiendo.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import {
  type ElementoOverpass,
  construirCallejero,
  consulta,
  mismoCallejero,
  motivoDemasiadoGrande,
  resumenCallejero,
  serializarCallejero,
} from './lib/callejero.ts';
import { RAIZ, abortar, ejecutarScript, log } from './lib/comun.ts';
import { consultarOverpass } from './lib/overpass.ts';
import { type Zona, recuadro } from './lib/zona.ts';

const leer = <T>(relativa: string): T => JSON.parse(readFileSync(path.join(RAIZ, relativa), 'utf8')) as T;

async function principal(): Promise<void> {
  log.paso('Callejero desde OpenStreetMap');
  const limites = leer<Zona['limites']>('datos/limite-municipal.geojson');
  const zona = leer<FeatureCollection<Polygon | MultiPolygon>>('datos/zona-cobertura.geojson').features[0] as Feature<
    Polygon | MultiPolygon
  > as Zona['zona'];

  const respuesta = await consultarOverpass<ElementoOverpass>(
    consulta(recuadro(zona)),
    'El callejero committeado sigue valiendo; vuelve a intentarlo más tarde.',
  );
  const version = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const callejero = construirCallejero(respuesta.elements, { limites, zona, version });
  const calles = callejero.entradas.filter((e) => e.t === 'calle').length;
  if (calles < 100) abortar(`Solo ${calles} calles: los datos de OSM parecen incompletos.`);

  const texto = serializarCallejero(callejero);
  const motivo = motivoDemasiadoGrande(texto);
  if (motivo) abortar(motivo);

  const ruta = path.join(RAIZ, 'public', 'callejero.json');
  if (existsSync(ruta) && mismoCallejero(texto, readFileSync(ruta, 'utf8'))) {
    log.ok('El callejero no ha cambiado en OpenStreetMap: se queda como está.');
    return;
  }
  const bytes = Buffer.byteLength(texto);
  writeFileSync(ruta, texto);
  log.ok(`public/callejero.json (${(bytes / 1000).toFixed(1)} kB, ${callejero.entradas.length} entradas)`);
  const resumen = resumenCallejero(callejero, respuesta.osm3s?.timestamp_osm_base ?? null, bytes);
  writeFileSync(path.join(RAIZ, 'datos', 'callejero.json'), `${JSON.stringify(resumen, null, 2)}\n`);
  log.ok(`datos/callejero.json: ${resumen.calles} calles y ${resumen.lugares} lugares`);
}

if (import.meta.main) ejecutarScript(principal);
