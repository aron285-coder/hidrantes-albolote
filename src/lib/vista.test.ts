// La vista del mapa guardada (docs/18 GM-04) y lo que no se guarda (docs/19 RV-62, 11 §6.1).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { VISTA, debeGuardarVista, guardarVista, vistaGuardada } from './vista';
import { almacenEnMemoria } from './pruebas';

afterEach(() => vi.unstubAllGlobals());

describe('vista del mapa', () => {
  it('se guarda y se recupera', () => {
    almacenEnMemoria();
    guardarVista({ lat: 37.23, lng: -3.65 }, 16, '');
    expect(vistaGuardada()).toEqual({ centro: [37.23, -3.65], zoom: 16 });
  });

  it('con ?incidente, ?aqui o ?medir no se guarda: diría dónde fue más allá de la sesión (RV-62)', () => {
    const datos = almacenEnMemoria();
    for (const busqueda of ['?incidente=37.2305,-3.656', '?aqui=37.2305,-3.656', '?medir=1', '?p=x&incidente=1,2']) {
      guardarVista({ lat: 37.23, lng: -3.65 }, 18, busqueda);
      expect(datos.has(VISTA), busqueda).toBe(false);
    }
    expect(debeGuardarVista('?p=abc')).toBe(true);
    expect(debeGuardarVista('')).toBe(true);
  });

  it('sin decir la dirección, mira la de la página', () => {
    const datos = almacenEnMemoria();
    vi.stubGlobal('location', { search: '?incidente=1,2' });
    guardarVista({ lat: 37.23, lng: -3.65 }, 18);
    expect(datos.has(VISTA)).toBe(false);
    vi.stubGlobal('location', { search: '' });
    guardarVista({ lat: 37.23, lng: -3.65 }, 18);
    expect(datos.has(VISTA)).toBe(true);
  });
});
