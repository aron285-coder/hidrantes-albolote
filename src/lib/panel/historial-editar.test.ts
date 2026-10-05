// docs/30 RV-129: la entrada de historial de Editar, fuera de descartar.tsx. Vitest corre en Node, sin
// DOM: `window.history` es un doble con lo justo.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MARCA, marcaActual, quitarEntradaDeEditar } from './historial-editar';

describe('historial de Editar (RV-129)', () => {
  const historial = { state: null as unknown, back: vi.fn() };
  beforeEach(() => {
    historial.state = null;
    historial.back.mockClear();
    vi.stubGlobal('window', { history: historial });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('marcaActual lee el campo de la entrada de arriba', () => {
    historial.state = { [MARCA]: 'abc' };
    expect(marcaActual()).toBe('abc');
    historial.state = null;
    expect(marcaActual()).toBeUndefined();
  });

  it('quitarEntradaDeEditar solo vuelve atrás si la entrada de arriba es la de Editar', () => {
    historial.state = { otra: 1 };
    quitarEntradaDeEditar();
    expect(historial.back).not.toHaveBeenCalled();
    historial.state = { [MARCA]: 'abc' };
    quitarEntradaDeEditar();
    expect(historial.back).toHaveBeenCalledTimes(1);
  });
});
