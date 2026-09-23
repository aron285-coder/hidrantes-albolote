// UTM ETRS89 huso 30 frente a PROJ (TR-119, docs/18 GM-01). Los vectores se calcularon con pyproj,
// EPSG:4258 → EPSG:25830. Tolerancia: 1 m.

import { describe, expect, it } from 'vitest';
import { aUtm, desdeUtm, enlaceGoogleMaps, formatoDecimal, formatoGms, formatoUtm } from './coordenadas';

const VECTORES: [number, number, number, number][] = [
  [37.2305, -3.656, 441808.02, 4120644.54],
  [37.256, -3.657, 441738.94, 4123474.12],
  [37.2, -3.7, 437879.84, 4117288.83],
  [37.35, -3.61, 445974.11, 4133874.64],
];

describe('UTM ETRS89 huso 30 (TR-119)', () => {
  it.each(VECTORES)('%f, %f → X %f, Y %f (≤ 1 m)', (lat, lng, x, y) => {
    const u = aUtm({ lat, lng });
    expect(u.huso).toBe(30);
    expect(Math.abs(u.x - x)).toBeLessThanOrEqual(1);
    expect(Math.abs(u.y - y)).toBeLessThanOrEqual(1);
  });

  it('la inversa: (441000, 4120000) → (37.224640, −3.665057)', () => {
    const p = desdeUtm({ x: 441000, y: 4120000 });
    expect(p.lat).toBeCloseTo(37.22464, 5);
    expect(p.lng).toBeCloseTo(-3.665057, 5);
  });

  it('ida y vuelta por debajo de 1 cm', () => {
    for (const [lat, lng] of VECTORES) {
      const vuelta = desdeUtm(aUtm({ lat, lng }));
      const u1 = aUtm({ lat, lng });
      const u2 = aUtm(vuelta);
      expect(Math.hypot(u1.x - u2.x, u1.y - u2.y)).toBeLessThan(0.01);
    }
  });

  it('fuera del huso lanza: el llamador no enseña UTM', () => {
    expect(() => aUtm({ lat: 40.4, lng: 2.17 })).toThrow(RangeError);
  });
});

describe('formatos', () => {
  const p = { lat: 37.2305, lng: -3.656 };

  it('decimal con seis cifras', () => {
    expect(formatoDecimal(p)).toBe('37.230500, -3.656000');
  });

  it('UTM redondeado a metro, con la banda S', () => {
    expect(formatoUtm(aUtm(p))).toBe('30S 441808 4120645');
  });

  it('grados, minutos y segundos, con O para el oeste', () => {
    expect(formatoGms(p)).toBe('37°13′49.8″N 3°39′21.6″O');
  });

  it('enlace de Google Maps a esas coordenadas', () => {
    expect(enlaceGoogleMaps(p)).toBe('https://www.google.com/maps/search/?api=1&query=37.230500,-3.656000');
  });
});
