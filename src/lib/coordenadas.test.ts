// UTM ETRS89 huso 30 frente a PROJ (TR-119, docs/18 GM-01). Los vectores se calcularon con pyproj,
// EPSG:4258 → EPSG:25830. Tolerancia: 1 m.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  RECUADRO_ZONA,
  aUtm,
  desdeUtm,
  enlaceGoogleMaps,
  esEnlaceCorto,
  formatoDecimal,
  formatoGms,
  formatoUtm,
  interpretar,
} from './coordenadas';

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

describe('interpretar (FR-73, docs/18 GM-04 B)', () => {
  const cerca = (texto: string, lat = 37.2305, lng = -3.656) => {
    const p = interpretar(texto);
    expect(p, texto).not.toBeNull();
    expect(Math.abs(p!.lat - lat), texto).toBeLessThan(0.00002);
    expect(Math.abs(p!.lng - lng), texto).toBeLessThan(0.00002);
  };

  it.each([
    '37.2305, -3.656',
    '37.2305 -3.656',
    '37.2305;-3.656',
    '37,2305 -3,656',
    '37.2305N 3.656W',
    '37.2305N 3.656O',
    '37.2305° N, 3.656° O',
  ])('decimal: %s', (t) => cerca(t));

  it.each([
    `37°13'49.8"N 3°39'21.6"W`,
    '37°13′49.8″N 3°39′21.6″O',
    '37º 13’ 49,8” N  3º 39’ 21,6” O',
    `37°13'49.8"N, 3°39'21.6"W`,
  ])('GMS: %s', (t) => cerca(t));

  it.each(['30S 441808 4120645', '441808 4120645', '441808, 4120645', 'X 441808 Y 4120645', 'x: 441808 y: 4120645'])(
    'UTM: %s',
    (t) => cerca(t, 37.2305, -3.656),
  );

  it.each([
    'https://www.google.com/maps/@37.2305,-3.656,17z',
    'https://www.google.es/maps/place/Calle+Real,+12/@37.2,-3.7,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d37.2305!4d-3.656',
    'https://www.google.com/maps/search/?api=1&query=37.230500,-3.656000',
    'https://maps.google.com/?q=37.2305,-3.656',
    'https://maps.google.com/?q=37.2305%2C-3.656',
    'https://maps.apple.com/?ll=37.2305,-3.656&z=17',
    'https://maps.apple.com/?q=37.2305,-3.656',
    'geo:37.2305,-3.656?z=17',
  ])('enlace: %s', (t) => cerca(t));

  it('el sitio marcado de un enlace de Google manda sobre el centro de la vista', () => {
    cerca('https://www.google.com/maps/place/X/@37.1,-3.5,15z/data=!3d37.2305!4d-3.656');
  });

  it('un enlace corto no se resuelve', () => {
    expect(interpretar('https://maps.app.goo.gl/AbCdEf123')).toBeNull();
    expect(esEnlaceCorto('https://maps.app.goo.gl/AbCdEf123')).toBe(true);
    expect(esEnlaceCorto('https://goo.gl/maps/AbCdEf')).toBe(true);
    expect(esEnlaceCorto('https://www.google.com/maps/@37.2305,-3.656,17z')).toBe(false);
  });

  it('UTM lejos de la zona → null', () => {
    expect(interpretar('30S 440000 4474000')).toBeNull(); // Madrid
    expect(interpretar('500000 4000000')).toBeNull();
  });

  it('unas coordenadas lejos de la zona se aceptan: el aviso de fuera de zona lo da quien llama', () => {
    cerca('40.4168, -3.7038', 40.4168, -3.7038);
  });

  it('lo que no son coordenadas → null', () => {
    for (const t of ['calle real 12', 'HID-0123', '12 3', '37, -3', '', '95.1, -3.6', 'https://example.com/']) {
      expect(interpretar(t), t).toBeNull();
    }
  });

  it('el recuadro es el de datos/meta.json', () => {
    const meta = JSON.parse(readFileSync('datos/meta.json', 'utf8')) as { recuadro: number[] };
    expect([...RECUADRO_ZONA]).toEqual(meta.recuadro);
  });
});
