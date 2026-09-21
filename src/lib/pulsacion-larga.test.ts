import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MS_PULSACION, TOLERANCIA_PX, detectorPulsacionLarga } from './pulsacion-larga';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const en = (x: number, y: number, extra: Record<string, unknown> = {}) => ({ clientX: x, clientY: y, ...extra });

describe('pulsación larga (FR-50, DEC-077)', () => {
  it('medio segundo sin soltar dispara, con las coordenadas de donde se puso el dedo', () => {
    const visto: { clientX: number; clientY: number }[] = [];
    const d = detectorPulsacionLarga((p) => visto.push(p));
    d.bajar(en(120, 340));
    expect(visto).toEqual([]);
    vi.advanceTimersByTime(MS_PULSACION);
    expect(visto).toEqual([{ clientX: 120, clientY: 340 }]);
  });

  it('soltar antes de tiempo no dispara: eso es un toque normal', () => {
    const disparar = vi.fn();
    const d = detectorPulsacionLarga(disparar);
    d.bajar(en(10, 10));
    vi.advanceTimersByTime(MS_PULSACION - 50);
    d.soltar();
    vi.advanceTimersByTime(1000);
    expect(disparar).not.toHaveBeenCalled();
  });

  it('arrastrar el mapa tampoco: pasada la tolerancia se cancela', () => {
    const disparar = vi.fn();
    const d = detectorPulsacionLarga(disparar);
    d.bajar(en(100, 100));
    d.mover(en(100 + TOLERANCIA_PX + 1, 100));
    vi.advanceTimersByTime(MS_PULSACION);
    expect(disparar).not.toHaveBeenCalled();
  });

  it('un temblor de dedo dentro de la tolerancia sí dispara', () => {
    const disparar = vi.fn();
    const d = detectorPulsacionLarga(disparar);
    d.bajar(en(100, 100));
    d.mover(en(104, 103));
    vi.advanceTimersByTime(MS_PULSACION);
    expect(disparar).toHaveBeenCalledTimes(1);
  });

  it('un segundo dedo cancela: quien hace pellizco quiere zoom, no un punto nuevo', () => {
    const disparar = vi.fn();
    const d = detectorPulsacionLarga(disparar);
    d.bajar(en(100, 100));
    d.bajar(en(300, 300, { isPrimary: false }));
    vi.advanceTimersByTime(MS_PULSACION);
    expect(disparar).not.toHaveBeenCalled();
    expect(d.esperando()).toBe(false);
  });

  it('cancelar deja el detector limpio y no dispara dos veces', () => {
    const disparar = vi.fn();
    const d = detectorPulsacionLarga(disparar);
    d.bajar(en(5, 5));
    vi.advanceTimersByTime(MS_PULSACION);
    expect(disparar).toHaveBeenCalledTimes(1);
    d.cancelar();
    vi.advanceTimersByTime(MS_PULSACION * 3);
    expect(disparar).toHaveBeenCalledTimes(1);
    expect(d.esperando()).toBe(false);
  });

  it('una pulsación nueva sustituye a la anterior en vez de acumular cuentas atrás', () => {
    const visto: { clientX: number }[] = [];
    const d = detectorPulsacionLarga((p) => visto.push(p));
    d.bajar(en(1, 1));
    vi.advanceTimersByTime(MS_PULSACION - 100);
    d.bajar(en(50, 50));
    vi.advanceTimersByTime(MS_PULSACION);
    expect(visto).toEqual([{ clientX: 50, clientY: 50 }]);
  });
});
