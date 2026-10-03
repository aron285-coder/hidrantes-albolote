// docs/24 RV-102a: un `caudal` que esta versión de la app no conoce (por ejemplo, uno que el
// servidor añada después) no rompe nada. Se dibuja como «no funciona», la ficha dice «Estado
// desconocido · actualiza la aplicación» y se anota un error una sola vez por sesión.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const anotarError = vi.fn();
vi.mock('./errores', () => ({ anotarError: (e: unknown) => anotarError(e) }));

const { caudalParaDibujar, esCaudalConocido, reiniciarAvisoCaudal } = await import('./caudal');
const { claseChip, nombreCaudal } = await import('./ficha');
const { svgMarcador, COLOR_CAUDAL } = await import('./simbologia');
const { CONFIG_POR_DEFECTO, derivar, radioPx } = await import('./derivar');
const { textoPunto } = await import('./compartir');
const { filtrar, ordenar } = await import('./puntos');
const { T } = await import('./textos');

import type { Caudal, Punto } from '../tipos/punto';

const DESCONOCIDO = 'otro_valor' as Caudal;

const punto = (id: string, caudal: Caudal): Punto => ({
  id,
  codigo: `HID-${id}`,
  tipo: 'hidrante',
  diametro_mm: 100,
  caudal,
  racor: null,
  descripcion_fallo: null,
  descripcion: null,
  direccion: 'Calle Real 5',
  foto_path: null,
  municipio: 'albolote',
  nucleo: 'Albolote',
  fecha_ultima_revision: '2026-08-01',
  actualizado_en: '2026-09-01T00:00:00Z',
  lat: 37.2305,
  lng: -3.656,
  radio_px: 11,
  revision_caducada: false,
});

beforeEach(() => {
  anotarError.mockClear();
  reiniciarAvisoCaudal();
});

describe('caudal desconocido (docs/24 RV-102a)', () => {
  it('se reconoce: los cuatro de hoy sí, cualquier otro no', () => {
    for (const c of ['bueno', 'regular', 'malo', 'no_funciona']) expect(esCaudalConocido(c)).toBe(true);
    for (const c of ['otro_valor', 'barro', 'constructor', 'toString', '', null, undefined, 3]) {
      expect(esCaudalConocido(c)).toBe(false);
    }
  });

  it('se dibuja como no funciona: gris, medio transparente y tachado, sin «undefined»', () => {
    const svg = svgMarcador({ tipo: 'hidrante', caudal: DESCONOCIDO, radio_px: 5, revision_caducada: false });
    expect(svg).not.toContain('undefined');
    expect(svg).not.toContain('NaN');
    expect(svg).toContain(`fill="${COLOR_CAUDAL.no_funciona}"`);
    expect(svg).toContain('opacity="0.5"');
    expect(svg).toContain('data-tachado');
  });

  it('el radio es el mínimo de la escala y nunca NaN', () => {
    const escala = CONFIG_POR_DEFECTO.escala_radios;
    for (const c of ['otro_valor', 'constructor', 'toString'] as unknown as Caudal[]) {
      expect(radioPx(100, c, escala)).toBe(escala[4]);
      const d = derivar(punto('0001', c), CONFIG_POR_DEFECTO, new Date(2026, 8, 1));
      expect(Number.isFinite(d.radio_px)).toBe(true);
      expect(d.radio_px).toBe(escala[4]);
    }
  });

  it('la ficha dice «Estado desconocido · actualiza la aplicación» con el chip gris', () => {
    expect(nombreCaudal(DESCONOCIDO)).toBe(T.ficha.estadoDesconocido);
    expect(T.ficha.estadoDesconocido).toBe('Estado desconocido · actualiza la aplicación');
    expect(claseChip(DESCONOCIDO)).toBe(claseChip('no_funciona'));
    expect(nombreCaudal('malo')).toBe(T.formulario.malo);
  });

  it('compartir un punto con estado desconocido no falla', () => {
    expect(() => textoPunto(punto('0001', DESCONOCIDO))).not.toThrow();
    expect(textoPunto(punto('0001', DESCONOCIDO))).toContain('estado desconocido');
  });

  it('en la lista va con «No funciona» y al final del orden por estado', () => {
    const lista = [punto('0003', DESCONOCIDO), punto('0001', 'no_funciona'), punto('0002', 'bueno')];
    expect(filtrar(lista, 'no_funciona').map((p) => p.id)).toEqual(['0003', '0001']);
    expect(ordenar(lista, 'estado', null).map((p) => p.id)).toEqual(['0002', '0001', '0003']);
  });

  it('anota el error una sola vez por sesión y sin datos del punto', () => {
    expect(caudalParaDibujar(DESCONOCIDO)).toBe('no_funciona');
    svgMarcador({ tipo: 'hidrante', caudal: DESCONOCIDO, radio_px: 5, revision_caducada: false });
    nombreCaudal(DESCONOCIDO);
    expect(anotarError).toHaveBeenCalledTimes(1);
    const mensaje = String((anotarError.mock.calls[0][0] as Error).message);
    expect(mensaje).not.toContain('otro_valor');
    expect(mensaje).not.toContain('HID-');
  });

  it('un caudal conocido no anota nada', () => {
    expect(caudalParaDibujar('malo')).toBe('malo');
    nombreCaudal('bueno');
    expect(anotarError).not.toHaveBeenCalled();
  });
});
