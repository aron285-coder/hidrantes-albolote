// La vista del mapa guardada (docs/18 GM-04), lo que no se guarda (docs/19 RV-62, 11 §6.1) y que
// solo dura la sesión (docs/33 RV-310).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { VISTA, debeGuardarVista, guardarVista, olvidarVistaAntigua, vistaGuardada } from './vista';
import { almacenEnMemoria } from './pruebas';

afterEach(() => vi.unstubAllGlobals());

/** sessionStorage en memoria (almacenEnMemoria simula localStorage). */
function sesionEnMemoria(): Map<string, string> {
  const datos = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, String(v)),
    removeItem: (k: string) => void datos.delete(k),
  });
  return datos;
}

describe('vista del mapa', () => {
  it('se guarda y se recupera', () => {
    sesionEnMemoria();
    guardarVista({ lat: 37.23, lng: -3.65 }, 16, '');
    expect(vistaGuardada()).toEqual({ centro: [37.23, -3.65], zoom: 16 });
  });

  it('solo en la sesión: otro día el mapa se abre donde está el voluntario (RV-310)', () => {
    const local = almacenEnMemoria();
    const sesion = sesionEnMemoria();
    guardarVista({ lat: 37.23, lng: -3.65 }, 16, '');
    expect(sesion.has(VISTA)).toBe(true);
    expect(local.has(VISTA)).toBe(false);
  });

  it('la que guardaban las versiones anteriores se borra y no se usa', () => {
    const local = almacenEnMemoria();
    sesionEnMemoria();
    local.set(VISTA, JSON.stringify({ centro: [37.23, -3.65], zoom: 16 }));
    expect(vistaGuardada()).toBeNull();
    olvidarVistaAntigua();
    expect(local.has(VISTA)).toBe(false);
  });

  it('con ?incidente, ?aqui o ?medir no se guarda: diría dónde fue (RV-62)', () => {
    const datos = sesionEnMemoria();
    for (const busqueda of ['?incidente=37.2305,-3.656', '?aqui=37.2305,-3.656', '?medir=1', '?p=x&incidente=1,2']) {
      guardarVista({ lat: 37.23, lng: -3.65 }, 18, busqueda);
      expect(datos.has(VISTA), busqueda).toBe(false);
    }
    expect(debeGuardarVista('?p=abc')).toBe(true);
    expect(debeGuardarVista('')).toBe(true);
  });

  it('sin decir la dirección, mira la de la página', () => {
    const datos = sesionEnMemoria();
    vi.stubGlobal('location', { search: '?incidente=1,2' });
    guardarVista({ lat: 37.23, lng: -3.65 }, 18);
    expect(datos.has(VISTA)).toBe(false);
    vi.stubGlobal('location', { search: '' });
    guardarVista({ lat: 37.23, lng: -3.65 }, 18);
    expect(datos.has(VISTA)).toBe(true);
  });

  it('sin almacenamiento de sesión no falla', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new DOMException('SecurityError');
      },
      setItem: () => {
        throw new DOMException('SecurityError');
      },
    });
    expect(() => guardarVista({ lat: 37.23, lng: -3.65 }, 16, '')).not.toThrow();
    expect(vistaGuardada()).toBeNull();
  });
});
