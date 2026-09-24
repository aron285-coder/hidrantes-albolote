// Fotos ya vistas en la caché del Service Worker, para que la ficha las enseñe sin cobertura
// (DEC-011). Solo lectura pública. Las `<img>` de fotos piden en modo CORS (`crossOrigin`), así que
// la respuesta es completa y se cuenta por su tamaño real: una respuesta opaca (status 0) contaría
// unos 7 MB de cuota en Chrome, en la misma cuota que la cola, los puntos y el mapa base (RV-12).
export const CACHE_FOTOS = {
  urlPattern: /\/storage\/v1\/object\/public\/hidrantes-fotos/,
  handler: 'CacheFirst' as const,
  options: {
    // El nombre se versiona cuando cambia el modo de petición: la caché anterior guardaba respuestas
    // opacas (no-cors) que CacheFirst devolvería a una petición CORS, y el navegador lo trata como un
    // error de red. public/sw-push.js borra la antigua al activarse (docs/18 RV-43).
    cacheName: 'hidrantes-fotos-v2',
    expiration: { maxEntries: 800, maxAgeSeconds: 180 * 24 * 3600, purgeOnQuotaError: true },
    cacheableResponse: { statuses: [200] },
  },
};
