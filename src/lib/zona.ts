// Zona de cobertura en el móvil (FR-55): solo para avisar, nunca para bloquear. El servidor vuelve a
// cruzar el punto con la zona al guardarlo (FR-14).

import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import zonaTexto from '../../datos/zona-cobertura.geojson?raw';

const ZONA = JSON.parse(zonaTexto) as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

export function dentroDeZona(lat: number, lng: number): boolean {
  return ZONA.features.some((f) => booleanPointInPolygon([lng, lat], f));
}
