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

const PANEL_ANCHO = '(min-width: 1024px)';

function suscribirPanel(o: () => void) {
  const m = window.matchMedia(PANEL_ANCHO);
  m.addEventListener('change', o);
  return () => m.removeEventListener('change', o);
}

/**
 * ¿Cabe la tabla del Inventario? Por debajo de 1.024 px (una tableta en vertical) las filas pasan a
 * dos líneas: la tabla cortaba la dirección y partía "Boca de riego" (docs/20 RV-79).
 */
export const usePanelAncho = () => useSyncExternalStore(suscribirPanel, () => window.matchMedia(PANEL_ANCHO).matches);
