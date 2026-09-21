// El almacenamiento local nunca puede tumbar la app (TR-07): en modo privado, con el espacio lleno
// o si el sistema lo desaloja, se lee null y se escribe en vano, sin excepciones.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { borrar, escribir, leer } from './almacen';

function almacenFalso(impl: Partial<Storage> = {}) {
  const datos = new Map<string, string>();
  const base: Storage = {
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => void datos.set(k, v),
    removeItem: (k) => void datos.delete(k),
    clear: () => datos.clear(),
    key: (i) => [...datos.keys()][i] ?? null,
    get length() {
      return datos.size;
    },
  };
  vi.stubGlobal('localStorage', { ...base, ...impl });
  return datos;
}

afterEach(() => vi.unstubAllGlobals());

describe('almacen (TR-07)', () => {
  it('guarda y recupera con el prefijo de la app', () => {
    const datos = almacenFalso();
    escribir('capa', 'satelite');
    expect(datos.get('hidrantes.capa')).toBe('"satelite"');
    expect(leer<string>('capa')).toBe('satelite');
    borrar('capa');
    expect(leer<string>('capa')).toBeNull();
  });

  it('una clave que no existe es null, no un fallo', () => {
    almacenFalso();
    expect(leer('nada')).toBeNull();
  });

  it('modo privado: escribir no lanza y leer sigue dando null', () => {
    almacenFalso({
      setItem: () => {
        throw new DOMException('QuotaExceededError');
      },
      getItem: () => {
        throw new DOMException('SecurityError');
      },
    });
    expect(() => escribir('capa', 'calle')).not.toThrow();
    expect(() => borrar('capa')).not.toThrow();
    expect(leer('capa')).toBeNull();
  });

  it('un valor corrupto se trata como si no estuviera', () => {
    const datos = almacenFalso();
    datos.set('hidrantes.capa', '{no es json');
    expect(leer('capa')).toBeNull();
  });

  it('sin localStorage (navegador que lo bloquea) tampoco lanza', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(leer('capa')).toBeNull();
    expect(() => escribir('capa', 1)).not.toThrow();
  });
});
