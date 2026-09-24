// Teselas sueltas del mapa base ya vistas en línea, en la caché del Service Worker (docs/20 RV-71,
// DEC-111): así lo que se ha mirado con cobertura también se ve sin ella, aunque el PMTiles entero
// aún no se haya descargado (FR-81). No se precachean: serían cientos de archivos en cada instalación.
//
// El nombre lleva la versión del mapa base. public/sw-push.js borra al activarse las de otras
// versiones, con el nombre vigente que le deja sw-teselas.js (lo emite `teselasPlugin` en el build).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

export const PREFIJO_CACHE_TESELAS = 'hidrantes-teselas-';

export const versionMapabase = (): string =>
  JSON.parse(readFileSync(path.resolve(import.meta.dirname, '..', 'datos', 'mapabase.json'), 'utf8')).version;

export function cacheTeselas(version: string) {
  return {
    urlPattern: /\/mapabase\/t\//,
    handler: 'CacheFirst' as const,
    options: {
      cacheName: `${PREFIJO_CACHE_TESELAS}${version}`,
      // 366 teselas en la versión 20260919: cabe el mapa entero y sobra para un recuadro algo mayor.
      expiration: { maxEntries: 600, purgeOnQuotaError: true },
      cacheableResponse: { statuses: [200] },
    },
  };
}

/** Archivo que el Service Worker importa antes de sw-push.js con el nombre de la caché vigente. */
export const SCRIPT_TESELAS = 'sw-teselas.js';

export const contenidoScriptTeselas = (version: string) =>
  `self.CACHE_TESELAS = ${JSON.stringify(`${PREFIJO_CACHE_TESELAS}${version}`)};\n`;

export function teselasPlugin(version: string): Plugin {
  return {
    name: 'hidrantes-teselas',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: SCRIPT_TESELAS, source: contenidoScriptTeselas(version) });
    },
  };
}
