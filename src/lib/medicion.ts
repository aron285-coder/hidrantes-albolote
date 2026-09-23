// Medir distancia en tramos de manguera (FR-76; docs/18 GM-06). La medición vive solo en la pantalla:
// no se guarda ni sale del móvil (11 §6.1). Aquí la parte que no depende del mapa, para probarla.

import type { LatLng } from './coordenadas';
import { longitudLinea, metros, tramos } from './geometria';

/** Un toque a 44 px o menos de un marcador se imanta a él (el objetivo táctil de 06 §9). */
export const RADIO_IMAN_PX = 44;
/** A partir de aquí cada tramo lleva su etiqueta de distancia. */
export const ETIQUETA_DESDE_M = 30;

export interface EnPantalla {
  x: number;
  y: number;
}

/** El marcador más cercano al toque dentro del radio, o null (FR-76). */
export function imantar<T extends EnPantalla>(toque: EnPantalla, marcadores: T[], radio = RADIO_IMAN_PX): T | null {
  let mejor: T | null = null;
  let mejorD = radio;
  for (const m of marcadores) {
    const d = Math.hypot(m.x - toque.x, m.y - toque.y);
    if (d <= mejorD) {
      mejor = m;
      mejorD = d;
    }
  }
  return mejor;
}

export const anadir = (vertices: LatLng[], v: LatLng) => [...vertices, v];
export const deshacer = (vertices: LatLng[]) => vertices.slice(0, -1);
export const borrar = (): LatLng[] => [];
/** "Deshacer" solo tiene sentido con dos vértices o más (UI-02: si no, deshabilitado y con motivo). */
export const puedeDeshacer = (vertices: LatLng[]) => vertices.length >= 2;

export interface Resumen {
  metros: number;
  tramos: number;
  /** Tramos de más de 30 m, con su punto medio y su longitud, para etiquetarlos en el mapa. */
  etiquetas: { en: LatLng; metros: number }[];
}

export function resumen(vertices: LatLng[], metrosTramo: number): Resumen {
  const total = longitudLinea(vertices);
  const etiquetas: Resumen['etiquetas'] = [];
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1]!;
    const b = vertices[i]!;
    const m = metros(a, b);
    if (m > ETIQUETA_DESDE_M) etiquetas.push({ en: { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }, metros: m });
  }
  return { metros: total, tramos: tramos(total, metrosTramo), etiquetas };
}
