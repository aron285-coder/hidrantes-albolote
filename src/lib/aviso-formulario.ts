// Un formulario a medias no se pierde sin preguntar (docs/31 RV-157): ni al tocar una notificación
// (el Service Worker no navega la ventana y manda un mensaje, public/sw-push.js) ni al recargar por
// una versión nueva.

/** Las pantallas de proponer (alta y las seis operaciones) son formularios con fotos. */
export const enFormulario = (ruta: string) => ruta.startsWith('/proponer');

/**
 * Escucha el aviso del Service Worker de una notificación tocada con un formulario abierto y pasa la
 * ruta a la que llevaba. Solo rutas de la propia app. Devuelve cómo dejar de escuchar.
 */
export function escucharAvisosPush(alAviso: (ruta: string) => void): () => void {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  if (!sw) return () => undefined;
  const oyente = (e: MessageEvent) => {
    const d = e.data as { tipo?: unknown; url?: unknown } | null;
    if (d?.tipo !== 'aviso_push' || typeof d.url !== 'string') return;
    if (!d.url.startsWith('/') || d.url.startsWith('//')) return;
    alAviso(d.url);
  };
  sw.addEventListener('message', oyente);
  return () => sw.removeEventListener('message', oyente);
}
