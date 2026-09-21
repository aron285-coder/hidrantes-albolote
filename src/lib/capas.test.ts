// Capas del mapa (FR-63, FR-93): qué se recuerda entre sesiones y qué atribución se enseña. Las
// licencias de OSM, el IGN y el Catastro obligan a citar la fuente de lo que se está viendo.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ATRIBUCION_BASE,
  CAPAS,
  CATASTRO,
  NOMBRE_CAPA,
  OSM,
  PNOA,
  ZOOM_MAX,
  atribucion,
  capaGuardada,
  enLinea,
} from './capas';
import { escribir } from './almacen';
import { almacenEnMemoria } from './pruebas';

afterEach(() => vi.unstubAllGlobals());

describe('capas (FR-63)', () => {
  it('las cuatro capas tienen nombre en la interfaz', () => {
    expect(CAPAS).toEqual(['base', 'calle', 'satelite', 'catastro']);
    for (const c of CAPAS) expect(NOMBRE_CAPA[c]).toBeTruthy();
  });

  it('solo el mapa base propio funciona sin red', () => {
    expect(enLinea('base')).toBe(false);
    expect(CAPAS.filter(enLinea)).toEqual(['calle', 'satelite', 'catastro']);
  });

  it('sin nada guardado, y ante un valor inventado, se cae al mapa base', () => {
    almacenEnMemoria();
    expect(capaGuardada()).toBe('base');
    escribir('capa', 'teledetección-marciana');
    expect(capaGuardada()).toBe('base');
  });

  it('la capa elegida se recuerda (FR-93)', () => {
    almacenEnMemoria();
    escribir('capa', 'satelite');
    expect(capaGuardada()).toBe('satelite');
  });

  it('cada capa cita su fuente, y el catastro también la de debajo', () => {
    expect(atribucion('base')).toBe(ATRIBUCION_BASE);
    expect(atribucion('calle')).toBe(OSM.opciones.attribution);
    expect(atribucion('satelite')).toBe(PNOA.opciones.attribution);
    expect(atribucion('catastro')).toContain(CATASTRO.opciones.attribution);
    expect(atribucion('catastro')).toContain(ATRIBUCION_BASE);
  });

  it('todas las URL de teselas son https y sin clave de API', () => {
    for (const url of [OSM.url, PNOA.url, CATASTRO.url]) {
      expect(url.startsWith('https://')).toBe(true);
      expect(url).not.toMatch(/api[_-]?key|token|apikey/i);
    }
  });
});

describe('tope de zoom (#136)', () => {
  // El fallo que esto evita: si una capa declara menos zoom que el mapa, Leaflet la quita entera al
  // pasar de su tope y la pantalla se queda en blanco. Con maxNativeZoom amplía la última tesela.
  it('el tope es z21, el mismo número que repite el e2e', () => {
    expect(ZOOM_MAX).toBe(21);
  });

  it('las capas de teselas llegan hasta el tope del mapa, ampliando la última tesela', () => {
    for (const capa of [OSM, PNOA]) {
      expect(capa.opciones.maxZoom).toBe(ZOOM_MAX);
      expect(capa.opciones.maxNativeZoom).toBeLessThan(ZOOM_MAX);
    }
  });

  it('cada una declara hasta donde de verdad tiene teselas', () => {
    // OSM publica hasta z19; el WMTS del IGN sirve hasta z20 y a partir de z21 responde 400.
    expect(OSM.opciones.maxNativeZoom).toBe(19);
    expect(PNOA.opciones.maxNativeZoom).toBe(20);
  });

  it('el catastro es WMS: dibuja a cualquier escala y no necesita tope propio', () => {
    expect(CATASTRO.opciones.maxZoom).toBe(ZOOM_MAX);
    expect(CATASTRO.opciones).not.toHaveProperty('maxNativeZoom');
  });
});
