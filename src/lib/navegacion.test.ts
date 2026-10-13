// docs/35 RV-420: «volver» desde la primera pantalla del historial lleva al inicio.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { volverOAlInicio } from './navegacion';

const conEstado = (state: unknown) => vi.stubGlobal('window', { history: { state } });

describe('volverOAlInicio (RV-420)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('con una pantalla anterior, vuelve a ella', () => {
    conEstado({ idx: 2 });
    const navegar = vi.fn();
    volverOAlInicio(navegar);
    expect(navegar).toHaveBeenCalledWith(-1);
  });

  it('la primera del historial (idx 0 o sin estado) va al inicio sin apilar otra entrada', () => {
    for (const estado of [{ idx: 0 }, null]) {
      conEstado(estado);
      const navegar = vi.fn();
      volverOAlInicio(navegar);
      expect(navegar).toHaveBeenCalledWith('/', { replace: true });
    }
  });
});
