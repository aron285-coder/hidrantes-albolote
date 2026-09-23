// Geometría a escala municipal para el modo incidente y la medición (FR-74, FR-76; docs/18 GM-01).
// Distancias sobre la esfera (haversine) y, para puntos contra segmentos, una proyección
// equirectangular local: a unos pocos kilómetros el error es de centímetros. Sin dependencias.

import type { LatLng } from './coordenadas';

const R = 6_371_000;
const rad = (g: number) => (g * Math.PI) / 180;
const grados = (r: number) => (r * 180) / Math.PI;

/** Metros entre dos puntos (haversine). */
export function metros(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rumbo inicial de `a` a `b`, en grados de 0 a 360 desde el norte, en el sentido de las agujas. */
export function rumbo(a: LatLng, b: LatLng): number {
  const f1 = rad(a.lat);
  const f2 = rad(b.lat);
  const dl = rad(b.lng - a.lng);
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (grados(Math.atan2(y, x)) + 360) % 360;
}

export type RumboCorto = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SO' | 'O' | 'NO';
const OCHO: RumboCorto[] = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

/** La rosa de ocho: cada sector abarca 45° centrados en su dirección. */
export const rumboCorto = (g: number): RumboCorto => OCHO[Math.round((((g % 360) + 360) % 360) / 45) % 8]!;

/** Proyección local en metros alrededor de `origen`. */
function plano(origen: LatLng) {
  const k = Math.cos(rad(origen.lat));
  return (p: LatLng) => ({ x: rad(p.lng - origen.lng) * R * k, y: rad(p.lat - origen.lat) * R });
}

/** Distancia de `p` al segmento `a`–`b`, en metros. */
export function distanciaASegmento(p: LatLng, a: LatLng, b: LatLng): number {
  const aPlano = plano(p);
  const A = aPlano(a);
  const B = aPlano(b);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const largo2 = dx * dx + dy * dy;
  // p es el origen del plano: (0, 0).
  const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1, -(A.x * dx + A.y * dy) / largo2));
  return Math.hypot(A.x + t * dx, A.y + t * dy);
}

/** Distancia de `p` a una línea de varios tramos; Infinity si la línea está vacía. */
export function distanciaALinea(p: LatLng, linea: LatLng[]): number {
  if (linea.length === 1) return metros(p, linea[0]!);
  let min = Infinity;
  for (let i = 1; i < linea.length; i++) min = Math.min(min, distanciaASegmento(p, linea[i - 1]!, linea[i]!));
  return min;
}

/** Punto del segmento `a`–`b` más cercano a `p`. */
export function puntoMasCercano(p: LatLng, a: LatLng, b: LatLng): LatLng {
  const aPlano = plano(p);
  const A = aPlano(a);
  const B = aPlano(b);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const largo2 = dx * dx + dy * dy;
  const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1, -(A.x * dx + A.y * dy) / largo2));
  return { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) };
}

/** Longitud de una línea de varios tramos, en metros. */
export function longitudLinea(puntos: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < puntos.length; i++) total += metros(puntos[i - 1]!, puntos[i]!);
  return total;
}

/** Tramos de manguera que hacen falta para cubrir `m` metros (FR-74, FR-76, FR-142). */
export const tramos = (m: number, largo: number) => (m <= 0 ? 0 : Math.ceil(m / largo));
