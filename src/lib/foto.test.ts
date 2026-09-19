// TR-15 y TR-47: tamaño final y lectura de la posición EXIF. Que la foto resultante no lleva EXIF se
// comprueba en el navegador (e2e/operaciones.spec.ts), donde existe el lienzo.

import { describe, expect, it } from 'vitest';
import { conExif } from './exif-prueba';
import { dimensiones, leerGpsExif } from './foto';

/** JPEG mínimo: SOI, un segmento cualquiera y EOI. Basta para el lector de EXIF. */
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9]);

describe('dimensiones (TR-15)', () => {
  it('reduce el lado mayor a 1600 px conservando proporciones', () => {
    expect(dimensiones(4032, 3024)).toEqual({ ancho: 1600, alto: 1200 });
    expect(dimensiones(3024, 4032)).toEqual({ ancho: 1200, alto: 1600 });
  });
  it('nunca agranda', () => {
    expect(dimensiones(800, 600)).toEqual({ ancho: 800, alto: 600 });
  });
});

describe('posición EXIF (TR-47)', () => {
  it('lee latitud y longitud, con el signo del hemisferio', () => {
    const r = leerGpsExif(conExif(JPEG, 37.2308, -3.6569).buffer as ArrayBuffer)!;
    expect(r.lat).toBeCloseTo(37.2308, 5);
    expect(r.lng).toBeCloseTo(-3.6569, 5);
  });
  it('sin EXIF, sin GPS o si no es un JPEG devuelve null', () => {
    expect(leerGpsExif(JPEG.buffer as ArrayBuffer)).toBeNull();
    expect(leerGpsExif(new Uint8Array([1, 2, 3, 4, 5, 6]).buffer as ArrayBuffer)).toBeNull();
    expect(leerGpsExif(new ArrayBuffer(0))).toBeNull();
  });
});
