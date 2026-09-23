// Geometría del modo incidente y la medición (FR-74, FR-76; docs/18 GM-01).

import { describe, expect, it } from 'vitest';
import { distanciaALinea, distanciaASegmento, longitudLinea, metros, rumbo, rumboCorto, tramos } from './geometria';

const O = { lat: 37.23, lng: -3.656 };
/** Un punto a `m` metros al norte / al este de O. */
const alNorte = (m: number) => ({ lat: O.lat + m / 111_195, lng: O.lng });
const alEste = (m: number) => ({ lat: O.lat, lng: O.lng + m / (111_195 * Math.cos((O.lat * Math.PI) / 180)) });

describe('rumbo', () => {
  it('exactamente al norte, al este y al suroeste', () => {
    expect(rumbo(O, alNorte(500))).toBeCloseTo(0, 3);
    expect(rumbo(O, alEste(500))).toBeCloseTo(90, 1);
    const so = { lat: O.lat - 0.004, lng: O.lng - 0.004 / Math.cos((O.lat * Math.PI) / 180) };
    expect(rumbo(O, so)).toBeCloseTo(225, 0);
  });

  it('la rosa de ocho: 22 es N y 23 es NE', () => {
    expect(rumboCorto(22)).toBe('N');
    expect(rumboCorto(23)).toBe('NE');
    expect(rumboCorto(359)).toBe('N');
    expect(rumboCorto(225)).toBe('SO');
    expect(rumboCorto(270)).toBe('O');
  });
});

describe('distancias', () => {
  it('metros entre dos puntos', () => {
    expect(metros(O, alNorte(100))).toBeCloseTo(100, 0);
  });

  it('a un segmento, con el punto proyectado dentro', () => {
    // Segmento de oeste a este que pasa 50 m al norte de O.
    const a = { lat: alNorte(50).lat, lng: alEste(-100).lng };
    const b = { lat: alNorte(50).lat, lng: alEste(100).lng };
    expect(distanciaASegmento(O, a, b)).toBeCloseTo(50, 0);
  });

  it('y fuera: la distancia es al extremo más cercano', () => {
    const a = alEste(30);
    const b = alEste(130);
    expect(distanciaASegmento(O, a, b)).toBeCloseTo(30, 0);
  });

  it('a una línea de varios tramos, el más cercano', () => {
    expect(distanciaALinea(O, [alEste(200), alNorte(80), alNorte(300)])).toBeLessThan(80.5);
    expect(distanciaALinea(O, [alNorte(40)])).toBeCloseTo(40, 0);
    expect(distanciaALinea(O, [])).toBe(Infinity);
  });

  it('longitud de una línea', () => {
    expect(longitudLinea([O, alNorte(100), alNorte(250)])).toBeCloseTo(250, 0);
    expect(longitudLinea([O])).toBe(0);
  });
});

describe('tramos de manguera', () => {
  it('redondea hacia arriba, y cero es cero', () => {
    expect(tramos(0, 20)).toBe(0);
    expect(tramos(1, 20)).toBe(1);
    expect(tramos(40, 20)).toBe(2);
    expect(tramos(41, 20)).toBe(3);
  });
});
