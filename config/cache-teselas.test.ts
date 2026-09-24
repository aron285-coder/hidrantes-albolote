// Teselas sueltas del mapa base en el Service Worker (docs/20 RV-71, DEC-111): se guardan al verlas,
// no se precachean, y al cambiar de versión se borran las viejas.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { archivoHeaders, TIPO_TESELA } from './cabeceras.ts';
import { cacheTeselas, contenidoScriptTeselas, SCRIPT_TESELAS, versionMapabase } from './cache-teselas.ts';

const leer = (r: string) => readFileSync(path.resolve(import.meta.dirname, '..', r), 'utf8');
const info = JSON.parse(leer('datos/mapabase.json'));

describe('caché de teselas sueltas (RV-71)', () => {
  const c = cacheTeselas(versionMapabase());
  it('CacheFirst, con la versión del mapa base en el nombre', () => {
    expect(c.handler).toBe('CacheFirst');
    expect(c.options.cacheName).toBe(`hidrantes-teselas-${info.version}`);
  });
  it('600 entradas como mucho, libera sitio si se acaba la cuota y solo guarda 200', () => {
    expect(c.options.expiration).toEqual({ maxEntries: 600, purgeOnQuotaError: true });
    expect(c.options.cacheableResponse.statuses).toEqual([200]);
  });
  it('solo las teselas sueltas, no el PMTiles entero', () => {
    expect(c.urlPattern.test(`https://x.pages.dev/mapabase/t/${info.version}/12/2005/1597.pbf`)).toBe(true);
    expect(c.urlPattern.test('https://x.pages.dev/mapabase/albolote.pmtiles')).toBe(false);
  });
});

describe('Service Worker (RV-71)', () => {
  const config = leer('vite.config.ts');
  it('no precachea teselas ni el PMTiles', () => {
    const globs = /globPatterns:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? '';
    expect(globs).not.toBe('');
    expect(globs).not.toMatch(/pbf|pmtiles/);
  });
  it('usa la regla de teselas e importa el nombre vigente antes que sw-push.js', () => {
    expect(config).toContain('cacheTeselas(mapabase)');
    expect(config).toMatch(/importScripts:\s*\[SCRIPT_TESELAS, 'sw-push.js'\]/);
    expect(SCRIPT_TESELAS).toBe('sw-teselas.js');
    expect(contenidoScriptTeselas('20260919')).toBe('self.CACHE_TESELAS = "hidrantes-teselas-20260919";\n');
  });
  it('sw-push.js borra al activarse las cachés de teselas de otras versiones', () => {
    const sw = leer('public/sw-push.js');
    expect(sw).toContain('self.CACHE_TESELAS');
    expect(sw).toMatch(/startsWith\('hidrantes-teselas-'\) && n !== vigente/);
  });
});

describe('cabeceras de las teselas (RV-71)', () => {
  const h = archivoHeaders({ entorno: 'staging' });
  it('las teselas no caducan: la ruta lleva la versión', () => {
    expect(h).toContain('/mapabase/t/*\n  Cache-Control: public, max-age=31536000, immutable');
  });
  it('tipo MVT solo en {z}/{x}/{y}, no en meta.json', () => {
    expect(TIPO_TESELA).toBe('application/vnd.mapbox-vector-tile');
    expect(h).toContain(`/mapabase/t/:version/:z/:x/:y\n  Content-Type: ${TIPO_TESELA}`);
  });
});
