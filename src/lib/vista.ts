// La vista del mapa (centro y zoom), guardada al moverlo: el mapa la recupera al volver y la
// búsqueda la usa como "centro del mapa" también desde la Lista (docs/18 GM-04).
//
// Solo dura la sesión (docs/33 RV-310): al abrir la aplicación otro día, el mapa se abre donde está
// el voluntario o con todos los puntos, no donde lo dejó la última vez. Dentro de la sesión se
// respeta: al volver de la ficha o de la Lista, el mapa sigue donde estaba.

import type { LatLng } from './coordenadas';

export const VISTA = 'hidrantes.vista';

/** El almacén de la sesión, o null si el navegador no lo deja usar. */
function sesion(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function vistaGuardada(): { centro: [number, number]; zoom: number } | null {
  try {
    const v = JSON.parse(sesion()?.getItem(VISTA) ?? 'null');
    return v && Array.isArray(v.centro) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Con `?incidente`, `?aqui` o `?medir` en la dirección no se guarda: la vista diría dónde fue el
 * incidente (11 §6.1, docs/19 RV-62).
 */
export const debeGuardarVista = (busqueda: string): boolean => {
  const q = new URLSearchParams(busqueda);
  return !q.has('incidente') && !q.has('aqui') && !q.has('medir');
};

export function guardarVista(centro: LatLng, zoom: number, busqueda = globalThis.location?.search ?? ''): void {
  if (!debeGuardarVista(busqueda)) return;
  try {
    sesion()?.setItem(VISTA, JSON.stringify({ centro: [centro.lat, centro.lng], zoom }));
  } catch {
    // sin almacenamiento: al volver, el mapa se coloca como al abrir la aplicación
  }
}

/** Centro del mapa la última vez que se vio en esta sesión, o null si aún no se ha visto. */
export function centroGuardado(): LatLng | null {
  const v = vistaGuardada();
  return v ? { lat: v.centro[0], lng: v.centro[1] } : null;
}

/**
 * El voluntario ya ha movido el mapa (o ha ido a algo concreto) en esta sesión: desde entonces se
 * respeta donde lo deja y ya no se coloca solo al abrirlo (RV-310). Va aparte de la vista, que se
 * guarda también con los movimientos que hace la aplicación.
 */
export const VISTA_MOVIDA = 'hidrantes.vista_movida';

export function marcarVistaMovida(): void {
  try {
    sesion()?.setItem(VISTA_MOVIDA, '1');
  } catch {
    // sin almacenamiento: al volver, el mapa se coloca otra vez como al abrir la aplicación
  }
}

export function vistaMovida(): boolean {
  try {
    return sesion()?.getItem(VISTA_MOVIDA) === '1';
  } catch {
    return false;
  }
}

/** Las versiones anteriores la guardaban para siempre: se borra para no dejar dónde estuvo el mapa. */
export function olvidarVistaAntigua(): void {
  try {
    globalThis.localStorage?.removeItem(VISTA);
  } catch {
    // sin almacenamiento: no hay nada que borrar
  }
}
