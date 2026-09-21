// Capas del mapa (FR-63, FR-93): qué se recuerda entre sesiones y qué atribución se enseña. Las
// licencias de OSM, el IGN y el Catastro obligan a citar la fuente de lo que se está viendo.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ATRIBUCION_BASE, CAPAS, CATASTRO, NOMBRE_CAPA, OSM, PNOA, atribucion, capaGuardada, enLinea } from './capas';
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
