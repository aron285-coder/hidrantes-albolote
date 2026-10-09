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
  /** Tramos de más de 30 m, con su punto medio, sus extremos y su longitud, para etiquetarlos. */
  etiquetas: { en: LatLng; desde: LatLng; hasta: LatLng; metros: number; tramo: number }[];
}

/** Un tramo más corto que esto en pantalla no lleva etiqueta: no cabe sin pisar otra; sale al acercar. */
export const MIN_TRAMO_ETIQUETA_PX = 70;
/** Aire entre el borde de la píldora y la línea. */
export const AIRE_ETIQUETA_PX = 5;

/** Ángulo (radianes, 0..π) en el vértice `v` entre las direcciones hacia `p` y hacia `q`. */
function angulo(v: EnPantalla, p: EnPantalla, q: EnPantalla): number {
  const a = Math.atan2(p.y - v.y, p.x - v.x);
  const b = Math.atan2(q.y - v.y, q.x - v.x);
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

/**
 * Dónde va la etiqueta de cada tramo, en píxeles de pantalla (docs/33 RV-318, D7): una píldora
 * apartada de la línea, en perpendicular, hacia fuera del ángulo que forma con el tramo vecino más
 * cerrado; así dos tramos en «V» no montan sus etiquetas en el vértice. Sin vecinos, por encima. Se
 * separa lo justo para que el borde de la píldora quede a `AIRE_ETIQUETA_PX` de la línea. Un tramo de
 * menos de `MIN_TRAMO_ETIQUETA_PX` en pantalla no la lleva. Se vuelve a calcular con cada zoom.
 *
 * `conEtiqueta[i]` dice si el tramo i (de `v[i]` a `v[i + 1]`) la lleva (los de más de 30 m).
 */
export function colocarEtiquetas(
  v: EnPantalla[],
  conEtiqueta: boolean[],
  tam: { ancho: number; alto: number },
): { x: number; y: number; visible: boolean }[] {
  const res: { x: number; y: number; visible: boolean }[] = [];
  for (let i = 0; i + 1 < v.length; i++) {
    const a = v[i]!;
    const b = v[i + 1]!;
    const medio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const largo = Math.hypot(b.x - a.x, b.y - a.y);
    if (!conEtiqueta[i] || largo < MIN_TRAMO_ETIQUETA_PX) {
      res.push({ ...medio, visible: false });
      continue;
    }
    let n = { x: -(b.y - a.y) / largo, y: (b.x - a.x) / largo };
    // El vecino más cerrado: el otro extremo del tramo anterior (en `a`) o del siguiente (en `b`).
    const vecinos: { p: EnPantalla; ang: number }[] = [];
    if (i > 0) vecinos.push({ p: v[i - 1]!, ang: angulo(a, b, v[i - 1]!) });
    if (i + 2 < v.length) vecinos.push({ p: v[i + 2]!, ang: angulo(b, a, v[i + 2]!) });
    vecinos.sort((x, y) => x.ang - y.ang);
    const cerrado = vecinos[0];
    if (cerrado) {
      // Al lado contrario del vecino.
      if (n.x * (cerrado.p.x - medio.x) + n.y * (cerrado.p.y - medio.y) > 0) n = { x: -n.x, y: -n.y };
    } else if (n.y > 0 || (n.y === 0 && n.x < 0)) {
      // Un tramo solo: por encima (o a la derecha si es vertical), como antes (RV-67).
      n = { x: -n.x, y: -n.y };
    }
    // Media caja en la dirección de la normal, más el aire: el borde no toca la línea.
    const separa = AIRE_ETIQUETA_PX + (Math.abs(n.x) * tam.ancho + Math.abs(n.y) * tam.alto) / 2;
    res.push({ x: medio.x + n.x * separa, y: medio.y + n.y * separa, visible: true });
  }
  return res;
}

export function resumen(vertices: LatLng[], metrosTramo: number): Resumen {
  const total = longitudLinea(vertices);
  const etiquetas: Resumen['etiquetas'] = [];
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1]!;
    const b = vertices[i]!;
    const m = metros(a, b);
    if (m > ETIQUETA_DESDE_M) {
      etiquetas.push({
        en: { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 },
        desde: a,
        hasta: b,
        metros: m,
        tramo: i - 1,
      });
    }
  }
  return { metros: total, tramos: tramos(total, metrosTramo), etiquetas };
}
