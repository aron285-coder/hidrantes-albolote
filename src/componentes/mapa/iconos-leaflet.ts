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

/** Marcador de un punto aprobado con la simbología de 06 §4. */
export const iconoPunto = (p: Simbolo, opacidad = 1) =>
  L.divIcon({
    className: 'marcador',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html: opacidad < 1 ? `<div style="opacity:${opacidad}">${svgMarcador(p)}</div>` : svgMarcador(p),
  });
