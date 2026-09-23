// Avisos push dentro del Service Worker (FR-163). Lo importa el Service Worker de Workbox
// (vite.config.ts, workbox.importScripts). El contenido llega de /api/push: { titulo, cuerpo, url }.

// La caché de fotos de antes de RV-12 guardaba respuestas opacas: con las <img> en modo CORS ya no
// sirven y harían fallar la foto. Su sucesora es hidrantes-fotos-v2 (config/cache-fotos.ts, RV-43).
self.addEventListener('activate', (evento) => {
  evento.waitUntil(caches.delete('hidrantes-fotos'));
});

self.addEventListener('push', (evento) => {
  let datos = {};
  try {
    datos = evento.data ? evento.data.json() : {};
  } catch {
    datos = { cuerpo: evento.data ? evento.data.text() : '' };
  }
  evento.waitUntil(
    self.registration.showNotification(datos.titulo || 'Hidrantes', {
      body: datos.cuerpo || '',
      icon: '/iconos/icono-192.png',
      badge: '/iconos/icono-192.png',
      lang: 'es',
      data: { url: datos.url || '/mis-propuestas' },
    }),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = new URL(evento.notification.data?.url || '/mis-propuestas', self.location.origin).href;
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if ('focus' in v) {
          v.navigate(destino);
          return v.focus();
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
