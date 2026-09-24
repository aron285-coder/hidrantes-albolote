// Capas de Leaflet compartidas por el mapa principal y el selector de pin de los formularios.

import L from 'leaflet';
import { PMTiles } from 'pmtiles';
import { labelRules, leafletLayer, paintRules } from 'protomaps-leaflet';
import zonaTexto from '../../../datos/zona-cobertura.geojson?raw';
import { CATASTRO, type Capa, OSM, PNOA, capasPintadas } from '@/lib/capas';
import { estiloLimite, estiloMapabase } from '@/lib/estilo-mapabase';
import { FuenteMapabase } from '@/lib/mapabase';

export const ZONA = JSON.parse(zonaTexto) as GeoJSON.FeatureCollection;
export const LIMITES = L.geoJSON(ZONA).getBounds();

// Una sola lectura del archivo para todas las capas base que se creen (claro/oscuro, formularios).
let archivo: PMTiles | null = null;
const mapabase = () => (archivo ??= new PMTiles(new FuenteMapabase()));

function capaBase(modo: 'claro' | 'oscuro'): L.Layer {
  const estilo = estiloMapabase(modo);
  return leafletLayer({
    url: mapabase(),
    paintRules: paintRules(estilo),
    labelRules: labelRules(estilo, 'es'),
    backgroundColor: estilo.background,
    maxDataZoom: 15,
    lang: 'es',
  }) as unknown as L.Layer;
}

/**
 * Las capas de `capasPintadas` de abajo arriba (el mapa base propio debajo si toca, RV-58) y el
 * límite de la zona encima.
 */
export function capasDe(capa: Capa, modo: 'claro' | 'oscuro', baseDebajo = false): L.Layer[] {
  const capas = capasPintadas(capa, baseDebajo).map((c): L.Layer => {
    if (c === 'calle') return L.tileLayer(OSM.url, OSM.opciones);
    if (c === 'satelite') return L.tileLayer(PNOA.url, PNOA.opciones);
    if (c === 'catastro') return L.tileLayer.wms(CATASTRO.url, CATASTRO.opciones);
    return capaBase(modo);
  });
  capas.push(L.geoJSON(ZONA, { style: estiloLimite(modo), interactive: false }));
  return capas;
}
