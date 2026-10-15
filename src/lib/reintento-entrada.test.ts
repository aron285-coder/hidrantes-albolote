import { describe, expect, it } from 'vitest';
import { AZAR_OCUPADO_S, REINTENTOS_OCUPADO, esperaOcupado } from './reintento-entrada';

// docs/37 RV-491 (DEC-211).
describe('esperaOcupado', () => {
  it('lo que dice el servidor más entre 0 y 10 s al azar', () => {
    expect(AZAR_OCUPADO_S).toBe(10);
    expect(REINTENTOS_OCUPADO).toBe(3);
    expect(esperaOcupado(1, () => 0)).toBe(1);
    expect(esperaOcupado(1, () => 0.999999)).toBe(11);
    expect(esperaOcupado(30, () => 0.5)).toBe(35);
  });

  it('un reintentar_en_s fuera de 1–60, o sin él, no deja una espera absurda', () => {
    expect(esperaOcupado(0, () => 0)).toBe(1);
    expect(esperaOcupado(-5, () => 0)).toBe(1);
    expect(esperaOcupado(3600, () => 0)).toBe(60);
    expect(esperaOcupado(undefined, () => 0)).toBe(30);
    expect(esperaOcupado(Number.NaN, () => 0)).toBe(30);
  });

  it('un azar fuera de [0, 1) no pasa de los 10 s', () => {
    expect(esperaOcupado(1, () => 1)).toBe(11);
    expect(esperaOcupado(1, () => -1)).toBe(1);
  });
});
