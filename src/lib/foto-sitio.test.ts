// docs/24 RV-103: la foto del sitio. Se procesa a 1280 px (la de la conexión sigue a 1600, TR-15) y
// es obligatoria en alta y en corregir ubicación, no en las demás.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { PERFIL_SITIO, procesarFoto } from './foto';
import { type Formulario, necesitaFotoSitio, queFalta } from './propuestas';
import { textoFallo } from './nombres-operacion';
import { textoError } from './panel/errores';
import { T } from './textos';
import { type PropuestaPanel, senales } from './panel/cola';
import type { Punto } from '../tipos/punto';

const a = T.avisosFormulario;

/** Lienzo de mentira: Node no tiene canvas. Guarda el tamaño y devuelve un JPEG de 100 kB. */
function lienzoFalso() {
  const lienzo = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => undefined }),
    toBlob: (cb: (b: Blob) => void) => cb(new Blob([new Uint8Array(100 * 1024)], { type: 'image/jpeg' })),
  };
  vi.stubGlobal('document', { createElement: () => lienzo });
  vi.stubGlobal('createImageBitmap', async () => ({ width: 4032, height: 3024, close: () => undefined }));
  return lienzo;
}
afterEach(() => vi.unstubAllGlobals());

describe('procesado de la foto del sitio (RV-103)', () => {
  it('sale con 1280 px de lado mayor', async () => {
    lienzoFalso();
    const f = await procesarFoto(new Blob([new Uint8Array([1, 2, 3])]), PERFIL_SITIO);
    expect([f.ancho, f.alto]).toEqual([1280, 960]);
    expect(PERFIL_SITIO.objetivoBytes).toBe(150 * 1024);
  });

  it('la de la conexión no cambia: 1600 px (TR-15)', async () => {
    lienzoFalso();
    const f = await procesarFoto(new Blob([new Uint8Array([1, 2, 3])]));
    expect([f.ancho, f.alto]).toEqual([1600, 1200]);
  });
});

const PUNTO = { id: 'p1', lat: 37.23, lng: -3.65 } as Punto;
const PIN = { lat: 37.2301, lng: -3.6501 };

describe('la foto del sitio es obligatoria en alta y en corregir ubicación (RV-103)', () => {
  it('alta completa salvo la del sitio → «Falta la foto del sitio»', () => {
    const f: Formulario = {
      operacion: 'alta',
      pin: PIN,
      tipo: 'hidrante',
      diametro: 70,
      caudal: 'bueno',
      hayFoto: true,
    };
    expect(queFalta(f, null)).toBe(a.faltaFotoSitio);
    expect(a.faltaFotoSitio).toBe('Falta la foto del sitio');
    expect(queFalta({ ...f, hayFotoSitio: true }, null)).toBeNull();
  });

  it('corregir ubicación también la pide', () => {
    const f: Formulario = { operacion: 'ubicacion', pin: PIN, pinMovido: true, hayFoto: true };
    expect(queFalta(f, PUNTO)).toBe(a.faltaFotoSitio);
    expect(queFalta({ ...f, hayFotoSitio: true }, PUNTO)).toBeNull();
  });

  it('revisión, estado, datos y retirada no', () => {
    expect(
      ['alta', 'ubicacion', 'revision', 'estado', 'datos', 'retirada'].filter((o) => necesitaFotoSitio(o as never)),
    ).toEqual(['alta', 'ubicacion']);
    expect(queFalta({ operacion: 'revision', hayFoto: true }, PUNTO)).toBeNull();
  });

  it('FOTO_SITIO_OBLIGATORIA se lee en palabras, en Mis propuestas y en el panel', () => {
    expect(textoFallo('FOTO_SITIO_OBLIGATORIA')).toBe(T.misPropuestas.errorFotoSitio);
    expect(textoError('FOTO_SITIO_OBLIGATORIA')).toBe(T.panelErrores.fotoSitio);
  });
});

describe('panel: la señal «sin foto del sitio» (RV-103)', () => {
  const base = {
    id: 'x',
    operacion: 'alta',
    datos: {},
    antes: null,
    foto_path: 'fotos/1.jpg',
  } as unknown as PropuestaPanel;

  it('un alta de la versión anterior lleva la señal, como aviso', () => {
    expect(senales({ ...base, sin_foto_sitio: true })).toContainEqual({
      texto: T.panelCola.senalSinFotoSitio,
      aviso: true,
    });
  });

  it('con las dos fotos, no', () => {
    const s = senales({ ...base, foto_sitio_path: 'fotos/2.jpg', sin_foto_sitio: false });
    expect(s.map((x) => x.texto)).not.toContain(T.panelCola.senalSinFotoSitio);
  });
});
