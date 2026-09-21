import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _reiniciar,
  anotarServidor,
  espera,
  estadoConexion,
  registrarComprobacion,
  reintentarAhora,
  suscribir,
} from './conexion';

beforeEach(() => {
  _reiniciar();
  vi.useFakeTimers();
});
afterEach(() => {
  _reiniciar();
  vi.useRealTimers();
});

describe('degradación controlada (FR-168)', () => {
  it('retroceso exponencial de 2 s a 60 s con ±20 % de azar', () => {
    expect([0, 1, 2, 3, 4, 5, 10].map((n) => espera(n, 0.5))).toEqual([2000, 4000, 8000, 16000, 32000, 60000, 60000]);
    expect(espera(0, 0)).toBe(1600);
    expect(espera(0, 1)).toBe(2400);
  });

  it('avisa solo cuando cambia el estado', () => {
    const oyente = vi.fn();
    suscribir(oyente);
    anotarServidor(true);
    expect(oyente).not.toHaveBeenCalled();
    anotarServidor(false);
    anotarServidor(false);
    expect(oyente).toHaveBeenCalledTimes(1);
    expect(estadoConexion()).toBe('sin_servidor');
    anotarServidor(true);
    expect(estadoConexion()).toBe('bien');
  });

  it('reintenta solo con esperas crecientes hasta que el servidor vuelve', async () => {
    let responde = false;
    const comprobar = vi.fn(async () => anotarServidor(responde));
    registrarComprobacion(comprobar);

    anotarServidor(false);
    await vi.advanceTimersByTimeAsync(espera(0, 1));
    expect(comprobar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(espera(1, 1));
    expect(comprobar).toHaveBeenCalledTimes(2);

    responde = true;
    await vi.advanceTimersByTimeAsync(espera(2, 1));
    expect(comprobar).toHaveBeenCalledTimes(3);
    expect(estadoConexion()).toBe('bien');

    await vi.advanceTimersByTimeAsync(120_000);
    expect(comprobar).toHaveBeenCalledTimes(3);
  });

  it('"Reintentar" ejecuta todas las comprobaciones aunque una falle', async () => {
    const buena = vi.fn(async () => undefined);
    registrarComprobacion(async () => {
      throw new Error('x');
    });
    registrarComprobacion(buena);
    await reintentarAhora();
    expect(buena).toHaveBeenCalledOnce();
  });
});
