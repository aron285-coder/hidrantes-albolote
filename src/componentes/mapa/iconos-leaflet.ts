// Iconos de Leaflet compartidos por el selector de pin de los formularios y el minimapa del panel.

import L from 'leaflet';
import { type Simbolo, svgMarcador } from '@/lib/simbologia';

/** Pin naranja con punto blanco (06 §4.3, "propuesto"). */
export const ICONO_PIN = L.divIcon({
  className: 'marcador',
  iconSize: [44, 44],
  iconAnchor: [22, 38],
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="-22 -38 44 44" aria-hidden="true" style="filter:drop-shadow(0 2px 2px rgba(0,0,0,.3))"><path d="M0 -32 C8 -32 13 -26 13 -18 C13 -9 0 4 0 4 C0 4 -13 -9 -13 -18 C-13 -26 -8 -32 0 -32 Z" fill="var(--naranja-600)" stroke="#fff" stroke-width="2"/><circle cx="0" cy="-18" r="4.5" fill="#fff"/></svg>`,
});

/**
 * El mismo pin, sin colocar: gris y discontinuo. En un alta sin posición GPS al día (sin GPS, o con
 * la posición `antigua`), el pin no está puesto hasta que se toca el mapa o se arrastra, y así lo
 * dice también «Mueve el pin al sitio correcto» (docs/31 RV-157, punto 6).
 */
export const ICONO_PIN_SIN_COLOCAR = L.divIcon({
  className: 'marcador pin-sin-colocar',
  iconSize: [44, 44],
  iconAnchor: [22, 38],
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="-22 -38 44 44" aria-hidden="true"><path d="M0 -32 C8 -32 13 -26 13 -18 C13 -9 0 4 0 4 C0 4 -13 -9 -13 -18 C-13 -26 -8 -32 0 -32 Z" fill="#fff" fill-opacity=".85" stroke="#7A8582" stroke-width="2" stroke-dasharray="4 3"/><circle cx="0" cy="-18" r="4.5" fill="#7A8582"/></svg>`,
});

/** Marcador de un punto aprobado con la simbología de 06 §4. */
export const iconoPunto = (p: Simbolo, opacidad = 1) =>
  L.divIcon({
    className: 'marcador',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html: opacidad < 1 ? `<div style="opacity:${opacidad}">${svgMarcador(p)}</div>` : svgMarcador(p),
  });
