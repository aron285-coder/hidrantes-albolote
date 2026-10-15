import { useSyncExternalStore } from 'react';

export type Ancho = 'movil' | 'tableta' | 'escritorio';

const TABLETA = '(min-width: 768px)';
const ESCRITORIO = '(min-width: 900px)';

function ancho(): Ancho {
  if (window.matchMedia(ESCRITORIO).matches) return 'escritorio';
  if (window.matchMedia(TABLETA).matches) return 'tableta';
  return 'movil';
}

function suscribir(o: () => void) {
  const q = [window.matchMedia(TABLETA), window.matchMedia(ESCRITORIO)];
  q.forEach((m) => m.addEventListener('change', o));
  return () => q.forEach((m) => m.removeEventListener('change', o));
}

/** Tramo de ancho de FR-70: desde 768 px mapa y ficha a la vez; desde 900 px, además la lista. */
export const useAncho = () => useSyncExternalStore(suscribir, ancho);

/**
 * Los anchos del panel (docs/38, DEC-213): móvil por debajo de 768 px, tableta de 768 a 1.099, PC pequeño de
 * 1.100 a 1.599 y PC grande desde 1.600. En Tailwind, `md:` para 768 y `min-[1100px]:` / `max-[1100px]:` y
 * `min-[1600px]:` para los otros (06 §5: nunca `max-[1099px]`).
 */
export const PANEL_TABLETA = 768;
export const PANEL_PC = 1100;
export const PANEL_GRANDE = 1600;

const PANEL_ANCHO = `(min-width: ${PANEL_PC}px)`;

function suscribirPanel(o: () => void) {
  const m = window.matchMedia(PANEL_ANCHO);
  m.addEventListener('change', o);
  return () => m.removeEventListener('change', o);
}

/**
 * ¿Van tablas en el panel? Desde 1.100 px (DEC-213), como la cola con el detalle y Editar a la derecha; por
 * debajo, filas. Hasta `docs/38` el corte del Inventario era 1.024 (docs/20 RV-79).
 */
export const usePanelAncho = () => useSyncExternalStore(suscribirPanel, () => window.matchMedia(PANEL_ANCHO).matches);

const PANEL_MOVIL = `(max-width: ${PANEL_TABLETA - 0.02}px)`;

function suscribirMovil(o: () => void) {
  const m = window.matchMedia(PANEL_MOVIL);
  m.addEventListener('change', o);
  return () => m.removeEventListener('change', o);
}

/** ¿Es el panel en el móvil, por debajo de 768 px (DEC-213)? Las pestañas van en el menú ☰ (UI-18). */
export const usePanelMovil = () => useSyncExternalStore(suscribirMovil, () => window.matchMedia(PANEL_MOVIL).matches);
