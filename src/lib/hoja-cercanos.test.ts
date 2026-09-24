// La hoja "Cercanos" del móvil: dos alturas, recordadas en la sesión (docs/19 RV-61).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { FRACCION_HOJA, alturaHoja, alturaTrasArrastrar, guardarAlturaHoja } from './hoja-cercanos';

afterEach(() => vi.unstubAllGlobals());

function sesionEnMemoria(rota = false) {
  const datos = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => {
      if (rota) throw new DOMException('SecurityError');
      return datos.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (rota) throw new DOMException('SecurityError');
      datos.set(k, v);
    },
  });
}

describe('altura de la hoja Cercanos (RV-61)', () => {
  it('por defecto la media (55 %); la alta es el 90 %', () => {
    sesionEnMemoria();
    expect(alturaHoja()).toBe('media');
    expect(FRACCION_HOJA).toEqual({ media: 0.55, alta: 0.9 });
  });

  it('se recuerda en la sesión', () => {
    sesionEnMemoria();
    guardarAlturaHoja('alta');
    expect(alturaHoja()).toBe('alta');
  });

  it('sin sessionStorage, la media y sin errores', () => {
    sesionEnMemoria(true);
    expect(() => guardarAlturaHoja('alta')).not.toThrow();
    expect(alturaHoja()).toBe('media');
  });

  it('arrastrar más de 30 px cambia; menos, no', () => {
    expect(alturaTrasArrastrar('media', -80)).toBe('alta');
    expect(alturaTrasArrastrar('alta', 80)).toBe('media');
    expect(alturaTrasArrastrar('media', -10)).toBe('media');
    expect(alturaTrasArrastrar('alta', 20)).toBe('alta');
  });
});
