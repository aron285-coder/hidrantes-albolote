// Caché de fotos del Service Worker (DEC-011, docs/17 RV-12). Una respuesta opaca (status 0) cuenta
// unos 7 MB de cuota en Chrome: con 800 fotos serían gigas, en la misma cuota que IndexedDB (la cola
// y los puntos) y el mapa base. Solo se guardan respuestas CORS completas.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CACHE_FOTOS } from './cache-fotos.ts';

describe('caché de fotos (RV-12)', () => {
  it('solo acepta 200, nunca respuestas opacas', () => {
    expect(CACHE_FOTOS.options.cacheableResponse.statuses).toEqual([200]);
  });
  it('libera sitio si se acaba la cuota', () => {
    expect(CACHE_FOTOS.options.expiration).toEqual({
      maxEntries: 800,
      maxAgeSeconds: 180 * 24 * 3600,
      purgeOnQuotaError: true,
    });
  });
  it('solo las fotos públicas del bucket', () => {
    expect(
      CACHE_FOTOS.urlPattern.test('https://x.supabase.co/storage/v1/object/public/hidrantes-fotos/fotos/a.jpg'),
    ).toBe(true);
    expect(CACHE_FOTOS.urlPattern.test('https://x.supabase.co/rest/v1/rpc/fn_listar_puntos')).toBe(false);
  });
});

// docs/18 RV-43: la caché antigua guarda respuestas opacas de la versión anterior; CacheFirst las
// devolvería a una petición CORS y el navegador lo trataría como error de red.
describe('nombre de la caché de fotos (RV-43)', () => {
  it('se versiona: termina en -v2', () => {
    expect(CACHE_FOTOS.options.cacheName).toMatch(/-v2$/);
  });
  it('el Service Worker borra la caché antigua al activarse', () => {
    const sw = readFileSync(path.resolve(import.meta.dirname, '../public/sw-push.js'), 'utf8');
    expect(sw).toContain("addEventListener('activate'");
    expect(sw).toContain("caches.delete('hidrantes-fotos')");
  });
});
