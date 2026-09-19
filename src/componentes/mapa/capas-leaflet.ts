// Capas de Leaflet compartidas por el mapa principal y el selector de pin de los formularios.

import L from 'leaflet';
import { PMTiles } from 'pmtiles';
import { labelRules, leafletLayer, paintRules } from 'protomaps-leaflet';
import zonaTexto from '../../../datos/zona-cobertura.geojson?raw';
import { CATASTRO, type Capa, OSM, PNOA } from '@/lib/capas';
import { estiloLimite, estiloMapabase } from '@/lib/estilo-mapabase';
import { FuenteMapabase } from '@/lib/mapabase';

export const ZONA = JSON.parse(zonaTexto) as GeoJSON.FeatureCollection;
export const LIMITES = L.geoJSON(ZONA).getBounds();

// Una sola lectura del archivo para todas las capas base que se creen (claro/oscuro, formularios).
let archivo: PMTiles | null = null;
const mapabase = () => (archivo ??= new PMTiles(new FuenteMapabase()));

/** Capa base (propia, calle o satélite), Catastro superpuesto si toca, y el límite de la zona. */
export function capasDe(capa: Capa, modo: 'claro' | 'oscuro'): L.Layer[] {
  const capas: L.Layer[] = [];
  if (capa === 'calle') capas.push(L.tileLayer(OSM.url, OSM.opciones));
  else if (capa === 'satelite') capas.push(L.tileLayer(PNOA.url, PNOA.opciones));
  else {
    const estilo = estiloMapabase(modo);
    capas.push(
      leafletLayer({
        url: mapabase(),
        paintRules: paintRules(estilo),
        labelRules: labelRules(estilo, 'es'),
        backgroundColor: estilo.background,
        maxDataZoom: 15,
        lang: 'es',
      }) as unknown as L.Layer,
    );
    if (capa === 'catastro') capas.push(L.tileLayer.wms(CATASTRO.url, CATASTRO.opciones));
  }
  capas.push(L.geoJSON(ZONA, { style: estiloLimite(modo), interactive: false }));
  return capas;
}
