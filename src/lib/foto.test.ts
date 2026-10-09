// TR-15 y TR-47: tamaño final y lectura de la posición EXIF. Que la foto resultante no lleva EXIF se
// comprueba en el navegador (e2e/operaciones.spec.ts), donde existe el lienzo.

import { FotoDemasiadoGrande, _reiniciarReduce, cabeceraHeic, reduceAlDecodificar } from './foto-grande';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { conExif } from './exif-prueba';
import {
  PERFIL_CONEXION,
  PERFIL_SITIO,
  cabeceraJpeg,
  cambiarFoto,
  dimensiones,
  leerGpsExif,
  opcionesDecodificar,
  procesarFoto,
} from './foto';

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

/** JPEG con su SOF0 (ancho × alto guardados) y, si se da, la orientación EXIF en IFD0. */
function jpegConCabecera(ancho: number, alto: number, orientacion?: number): Uint8Array<ArrayBuffer> {
  const b: number[] = [0xff, 0xd8];
  if (orientacion) {
    const tiff = [
      0x4d,
      0x4d,
      0,
      0x2a,
      0,
      0,
      0,
      8,
      0,
      1,
      0x01,
      0x12,
      0,
      3,
      0,
      0,
      0,
      1,
      0,
      orientacion,
      0,
      0,
      0,
      0,
      0,
      0,
    ];
    const largo = 2 + 6 + tiff.length;
    b.push(0xff, 0xe1, largo >> 8, largo & 255, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff);
  }
  b.push(0xff, 0xdb, 0, 4, 0, 0); // una tabla cualquiera antes del SOF
  b.push(0xff, 0xc0, 0, 17, 8, alto >> 8, alto & 255, ancho >> 8, ancho & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
  b.push(0xff, 0xda, 0, 2, 0xff, 0xd9);
  return Uint8Array.from(b);
}

describe('foto grande sin decodificarla entera (docs/31 RV-157)', () => {
  it('lee el tamaño guardado y la orientación de la cabecera del JPEG', () => {
    expect(cabeceraJpeg(jpegConCabecera(8000, 6000, 6).buffer as ArrayBuffer)).toEqual({
      ancho: 8000,
      alto: 6000,
      orientacion: 6,
    });
    expect(cabeceraJpeg(jpegConCabecera(4000, 3000).buffer as ArrayBuffer)).toEqual({
      ancho: 4000,
      alto: 3000,
      orientacion: 1,
    });
    expect(cabeceraJpeg(JPEG.buffer as ArrayBuffer)).toBeNull();
    expect(cabeceraJpeg(new ArrayBuffer(0))).toBeNull();
  });

  it('pide al navegador la foto ya reducida, con el giro de la cámara aplicado', () => {
    // 108 MP, de pie (orientación 6: guardada tumbada).
    expect(opcionesDecodificar({ ancho: 12000, alto: 9000, orientacion: 6 }, PERFIL_CONEXION)).toEqual({
      imageOrientation: 'from-image',
      resizeWidth: 1200,
      resizeQuality: 'high',
    });
    expect(opcionesDecodificar({ ancho: 4000, alto: 3000, orientacion: 1 }, PERFIL_SITIO)).toMatchObject({
      resizeWidth: 1280,
    });
    // Pequeña o sin cabecera: como siempre.
    expect(opcionesDecodificar({ ancho: 800, alto: 600, orientacion: 1 }, PERFIL_CONEXION)).toEqual({
      imageOrientation: 'from-image',
    });
    expect(opcionesDecodificar(null, PERFIL_CONEXION)).toEqual({ imageOrientation: 'from-image' });
  });

  describe('procesarFoto', () => {
    const cerrar = vi.fn();
    const crear = vi.fn();
    let lienzo2d: unknown;
    beforeEach(() => {
      cerrar.mockReset();
      crear.mockReset();
      crear.mockImplementation(async (_b: Blob, o: ImageBitmapOptions) => ({
        width: o.resizeWidth ?? 12000,
        // De pie (orientación 6): el navegador gira y reduce guardando la proporción.
        height: o.resizeWidth ? Math.round((o.resizeWidth * 4) / 3) : 9000,
        close: cerrar,
      }));
      lienzo2d = { drawImage: vi.fn() };
      vi.stubGlobal('createImageBitmap', crear);
      vi.stubGlobal('document', {
        createElement: () => ({
          getContext: () => lienzo2d,
          toBlob: (r: (b: Blob) => void) => r(new Blob([new Uint8Array(1000)], { type: 'image/jpeg' })),
        }),
      });
    });
    afterEach(() => vi.unstubAllGlobals());
    // La prueba de si el navegador reduce al decodificar (RV-244) se hace aquí, una vez, y no cuenta.
    beforeEach(async () => {
      _reiniciarReduce();
      await reduceAlDecodificar();
      crear.mockClear();
      cerrar.mockClear();
    });

    it('decodifica ya reducida una foto enorme', async () => {
      const r = await procesarFoto(new Blob([jpegConCabecera(12000, 9000, 6)]));
      expect(crear).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ resizeWidth: 1200 }));
      expect(r).toMatchObject({ ancho: 1200, alto: 1600 });
      expect(cerrar).toHaveBeenCalledTimes(1);
    });

    it('si el navegador redondea el alto un píxel, el tamaño final sigue siendo el exacto', async () => {
      crear.mockImplementationOnce(async () => ({ width: 1280, height: 961, close: cerrar }));
      const r = await procesarFoto(new Blob([jpegConCabecera(2400, 1800)]), PERFIL_SITIO);
      expect(r).toMatchObject({ ancho: 1280, alto: 960 });
    });

    it('si el navegador no sabe reducir al decodificar, una foto de hasta 26 MP se abre como antes', async () => {
      crear.mockImplementationOnce(async () => {
        throw new TypeError('resizeWidth no admitido');
      });
      crear.mockImplementationOnce(async () => ({ width: 3000, height: 4000, close: cerrar }));
      const r = await procesarFoto(new Blob([jpegConCabecera(4000, 3000, 6)]));
      expect(crear).toHaveBeenCalledTimes(2);
      expect(crear.mock.calls[1]![1]).toEqual({ imageOrientation: 'from-image' });
      expect(r).toMatchObject({ ancho: 1200, alto: 1600 });
    });

    it('la cámara por defecto de un iPhone 15 o 16 (5712 × 4284, 24,5 MP) se abre en un navegador que no reduce (docs/33 RV-326)', async () => {
      crear.mockImplementation(async (_b: Blob, o?: ImageBitmapOptions) => {
        if (o?.resizeWidth !== undefined) throw new TypeError('resizeWidth no admitido');
        return { width: 5712, height: 4284, close: cerrar };
      });
      _reiniciarReduce();
      const r = await procesarFoto(new Blob([jpegConCabecera(5712, 4284)]));
      expect(r).toMatchObject({ ancho: 1600, alto: 1200 });
    });

    it('la de 24,5 MP, si falla abrirla reducida, se abre entera (docs/33 RV-326)', async () => {
      crear.mockImplementationOnce(async () => {
        throw new Error('sin memoria');
      });
      crear.mockImplementationOnce(async () => ({ width: 5712, height: 4284, close: cerrar }));
      const r = await procesarFoto(new Blob([jpegConCabecera(5712, 4284)]));
      expect(crear.mock.calls[1]![1]).toEqual({ imageOrientation: 'from-image' });
      expect(r).toMatchObject({ ancho: 1600, alto: 1200 });
    });

    it('por encima de 26 MP, en un navegador que no reduce, sigue el aviso (docs/33 RV-326)', async () => {
      crear.mockImplementation(async () => {
        throw new TypeError('resizeWidth no admitido');
      });
      _reiniciarReduce();
      // 6000 × 4500 = 27 MP.
      await expect(procesarFoto(new Blob([jpegConCabecera(6000, 4500)]))).rejects.toBeInstanceOf(FotoDemasiadoGrande);
    });

    it('una foto de 50 MP en un navegador que no reduce: aviso, y no se abre (docs/32 RV-244)', async () => {
      // El navegador rechaza resizeWidth: la prueba se repite con él.
      crear.mockImplementation(async () => {
        throw new TypeError('resizeWidth no admitido');
      });
      _reiniciarReduce();
      await expect(procesarFoto(new Blob([jpegConCabecera(8660, 5774)]))).rejects.toBeInstanceOf(FotoDemasiadoGrande);
      // Solo la prueba de 1 × 1: la foto no se ha decodificado.
      expect(crear).toHaveBeenCalledTimes(1);
    });

    it('una de 50 MP cuya apertura reducida falla: aviso, no se abre entera (RV-244)', async () => {
      crear.mockImplementationOnce(async () => {
        throw new Error('sin memoria');
      });
      await expect(procesarFoto(new Blob([jpegConCabecera(8660, 5774)]))).rejects.toBeInstanceOf(FotoDemasiadoGrande);
      expect(crear).toHaveBeenCalledTimes(1);
    });

    it('una HEIC de 50 MP en un navegador que sí reduce: se pide ya reducida (RV-244)', async () => {
      await procesarFoto(new Blob([heicConCabecera(8160, 6120)]));
      expect(crear).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ resizeWidth: 1600 }));
    });

    it('una de 50 MP en un navegador que sí reduce: se abre ya reducida', async () => {
      const r = await procesarFoto(new Blob([jpegConCabecera(8660, 5774)]));
      expect(crear).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ resizeWidth: 1600 }));
      expect(r.blob).toBeInstanceOf(Blob);
    });

    it('libera la imagen aunque falle el dibujo', async () => {
      lienzo2d = null;
      await expect(procesarFoto(new Blob([jpegConCabecera(4000, 3000)]))).rejects.toThrow();
      expect(cerrar).toHaveBeenCalledTimes(1);
    });
  });
});

describe('«Repetir» una foto (docs/31 RV-157)', () => {
  const vieja = { blob: new Blob(['a']), ancho: 1, alto: 1, exif: null };
  const nueva = { blob: new Blob(['b']), ancho: 2, alto: 2, exif: null };

  it('mientras se prepara la nueva no hay foto (Enviar espera); luego, la nueva', async () => {
    const cambios: unknown[] = [];
    await expect(
      cambiarFoto(
        vieja,
        async () => nueva,
        (f) => cambios.push(f),
      ),
    ).resolves.toBe(true);
    expect(cambios).toEqual([null, nueva]);
  });

  it('si la nueva falla, vuelve la anterior y se dice', async () => {
    const cambios: unknown[] = [];
    const r = await cambiarFoto(
      vieja,
      async () => {
        throw new Error('ilegible');
      },
      (f) => cambios.push(f),
    );
    expect(r).toBe(false);
    expect(cambios).toEqual([null, vieja]);
  });

  it('la primera foto, sin anterior: si falla, sigue sin foto', async () => {
    const cambios: unknown[] = [];
    const r = await cambiarFoto(
      null,
      async () => {
        throw new Error('ilegible');
      },
      (f) => cambios.push(f),
    );
    expect(r).toBe(false);
    expect(cambios).toEqual([]);
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

/** Lo mínimo de una HEIC: ftyp y, dentro de meta, las cajas ispe (una por tesela y la de la imagen entera). */
function heicConCabecera(ancho: number, alto: number): ArrayBuffer {
  const caja = (tipo: string, cuerpo: number[]) => {
    const t = [...tipo].map((c) => c.charCodeAt(0));
    const n = 8 + cuerpo.length;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, ...t, ...cuerpo];
  };
  const u32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const ftyp = caja('ftyp', [...'heic'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0]));
  const tesela = caja('ispe', [0, 0, 0, 0, ...u32(512), ...u32(512)]);
  const entera = caja('ispe', [0, 0, 0, 0, ...u32(ancho), ...u32(alto)]);
  return Uint8Array.from([...ftyp, ...caja('meta', [0, 0, 0, 0, ...tesela, ...entera])]).buffer;
}

describe('cabecera HEIC (docs/32 RV-244)', () => {
  it('lee el tamaño de la imagen entera, no el de una tesela', () => {
    expect(cabeceraHeic(heicConCabecera(8160, 6120))).toEqual({ ancho: 8160, alto: 6120 });
  });
  it('lo que no es HEIC: null', () => {
    expect(cabeceraHeic(jpegConCabecera(4000, 3000).buffer as ArrayBuffer)).toBeNull();
    expect(cabeceraHeic(new ArrayBuffer(0))).toBeNull();
  });
});
