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
