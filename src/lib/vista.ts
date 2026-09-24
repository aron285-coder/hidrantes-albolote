// La vista del mapa (centro y zoom), guardada al moverlo: el mapa la recupera al volver y la
// búsqueda la usa como "centro del mapa" también desde la Lista (docs/18 GM-04).

import type { LatLng } from './coordenadas';

export const VISTA = 'hidrantes.vista';

export function vistaGuardada(): { centro: [number, number]; zoom: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(VISTA) ?? 'null');
    return v && Array.isArray(v.centro) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Con `?incidente`, `?aqui` o `?medir` en la dirección no se guarda: la vista diría dónde fue el
 * incidente más allá de la sesión (11 §6.1, docs/19 RV-62).
 */
export const debeGuardarVista = (busqueda: string): boolean => {
  const q = new URLSearchParams(busqueda);
  return !q.has('incidente') && !q.has('aqui') && !q.has('medir');
};

export function guardarVista(centro: LatLng, zoom: number, busqueda = globalThis.location?.search ?? ''): void {
  if (!debeGuardarVista(busqueda)) return;
  try {
    localStorage.setItem(VISTA, JSON.stringify({ centro: [centro.lat, centro.lng], zoom }));
  } catch {
    // sin almacenamiento: la próxima vez se encuadra la zona
  }
}

/** Centro del mapa la última vez que se vio, o null si nunca se ha movido. */
export function centroGuardado(): LatLng | null {
  const v = vistaGuardada();
  return v ? { lat: v.centro[0], lng: v.centro[1] } : null;
}
