// Un formulario a medias no se pierde sin preguntar (docs/31 RV-157): ni al tocar una notificación
// (el Service Worker no navega la ventana y manda un mensaje, public/sw-push.js) ni al recargar por
// una versión nueva.

/** La pantalla de resultado tras enviar: ya no hay nada a medias (docs/32 RV-240). */
export const RUTA_HECHO = '/proponer/hecho';

/**
 * Las pantallas de proponer (alta y las seis operaciones) son formularios con fotos. La de resultado,
 * no: recargar o abrir una notificación desde ahí no pregunta (docs/32 RV-240). Mismo criterio en
 * public/sw-push.js.
 */
export const enFormulario = (ruta: string) => ruta.startsWith('/proponer') && !ruta.startsWith(RUTA_HECHO);

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
