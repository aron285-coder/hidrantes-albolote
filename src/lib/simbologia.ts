// Marcador del punto, exactamente como 06 §4. El radio viene del servidor (`radio_px` de
// v_puntos_activos, con la escala de config); aquí solo se dibuja. Mismo dibujo en mapa, lista,
// ficha y leyenda.

import type { Caudal, TipoPunto } from './puntos';

/** Rellenos de estado (06 §2.2), idénticos en claro y oscuro. */
export const COLOR_CAUDAL: Record<Caudal, string> = {
  bueno: 'var(--verde-600)',
  regular: 'var(--ambar-700)',
  malo: 'var(--rojo-700)',
  no_funciona: 'var(--gris-700)',
};

/** Objetivo táctil mínimo alrededor de cada marcador (06 §4.3, UI-15). */
export const OBJETIVO_TACTIL = 44;

export interface Simbolo {
  tipo: TipoPunto;
  caudal: Caudal;
  radio_px: number;
  revision_caducada: boolean;
}

/** Radio de esquina del cuadrado de la boca de riego (06 §4.3). */
export function esquina(r: number): number {
  if (r <= 5) return 2;
  if (r <= 5.5) return 2.5;
  return 3;
}

/** Grosor del borde: 2,5 px, o 2 px si el radio es ≤ 5,5. */
export const grosorBorde = (r: number) => (r <= 5.5 ? 2 : 2.5);

/**
 * SVG del marcador centrado en (0, 0). `tamano` es el lado del lienzo (44 en el mapa para el
 * objetivo táctil). El borde usa --borde-marcador, blanco en los dos modos (DEC-072).
 */
export function svgMarcador(p: Simbolo, { tamano = OBJETIVO_TACTIL, seleccionado = false } = {}): string {
  const r = p.radio_px;
  const bw = grosorBorde(r);
  const nf = p.caudal === 'no_funciona';
  const trazo = `stroke="var(--borde-marcador)" stroke-width="${bw}"${p.revision_caducada ? ' stroke-dasharray="3 2.5"' : ''}`;
  const relleno = `fill="${COLOR_CAUDAL[p.caudal]}"${nf ? ' opacity="0.5"' : ''}`;
  const forma =
    p.tipo === 'hidrante'
      ? `<circle data-forma="circulo" r="${r}" ${relleno} ${trazo}/>`
      : `<rect data-forma="cuadrado" x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}" rx="${esquina(r)}" ${relleno} ${trazo}/>`;
  const tachado = nf
    ? `<line data-tachado x1="${-r}" y1="${r}" x2="${r}" y2="${-r}" stroke="var(--borde-marcador)" stroke-width="2"/>`
    : '';
  const anillo = seleccionado
    ? `<circle data-seleccion r="${r + bw + 3}" fill="none" stroke="var(--anillo-seleccion)" stroke-width="2"/>`
    : '';
  const m = tamano / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamano}" height="${tamano}" viewBox="${-m} ${-m} ${tamano} ${tamano}" aria-hidden="true">${anillo}${forma}${tachado}</svg>`;
}

/** Declutter por zoom (06 §4.4): al alejar desaparecen primero los más pequeños. Sin racimos. */
export function radioMinimo(zoom: number): number {
  if (zoom <= 13) return 9;
  if (zoom <= 15) return 7;
  return 0;
}

export const visibleEnZoom = (radio: number, zoom: number) => radio >= radioMinimo(zoom);
