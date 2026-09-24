// Recuadro de la zona de cobertura para las Functions, sin importar GeoJSON (docs/18 GM-04 C). Es el
// `recuadro` de datos/meta.json, [oeste, sur, este, norte]; un test comprueba que siguen iguales.

export const RECUADRO_ZONA = [-3.711504, 37.206212, -3.601049, 37.404078] as const;

/** Dentro del recuadro con `margen` metros alrededor. */
export function cercaDeLaZona(lat: number, lng: number, margen: number): boolean {
  const [oeste, sur, este, norte] = RECUADRO_ZONA;
  const dLat = margen / 111_195;
  const dLng = margen / (111_195 * Math.cos((((sur + norte) / 2) * Math.PI) / 180));
  return lat >= sur - dLat && lat <= norte + dLat && lng >= oeste - dLng && lng <= este + dLng;
}
