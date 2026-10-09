// Dónde se abre el mapa (docs/33 RV-310, U1): en una emergencia cada toque cuenta. Con la posición
// del voluntario al día y dentro de la zona, a zoom de calle sobre él; si no, con todos los puntos a
// la vista (no la zona entera, que deja los puntos en dos manchas).

import { type Posicion, esAntigua } from './posicion';
import { dentroDeZona } from './zona';

/** Zoom de calle (z17): se ven los marcadores de todos los tamaños (06 §4.4) y los nombres de las calles. */
export const ZOOM_CALLE = 17;

export type EncuadreInicial =
  | { tipo: 'posicion'; lat: number; lng: number; zoom: number }
  | { tipo: 'puntos'; recuadro: [[number, number], [number, number]] }
  | { tipo: 'nada' };

export function encuadreInicial(
  posicion: Posicion | null,
  puntos: readonly { lat: number; lng: number }[],
  ahora = Date.now(),
): EncuadreInicial {
  if (posicion && !esAntigua(posicion, ahora) && dentroDeZona(posicion.lat, posicion.lng)) {
    return { tipo: 'posicion', lat: posicion.lat, lng: posicion.lng, zoom: ZOOM_CALLE };
  }
  if (puntos.length === 0) return { tipo: 'nada' };
  let [sur, oeste, norte, este] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of puntos) {
    sur = Math.min(sur, p.lat);
    norte = Math.max(norte, p.lat);
    oeste = Math.min(oeste, p.lng);
    este = Math.max(este, p.lng);
  }
  return {
    tipo: 'puntos',
    recuadro: [
      [sur, oeste],
      [norte, este],
    ],
  };
}
