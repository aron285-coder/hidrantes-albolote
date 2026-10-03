// docs/24 RV-102 (DEC-145, DEC-149): el estado "Barro". Tamaño mínimo y tachado, con su color
// marrón (no atenuado como No funciona); fuera de Cercanos; dentro de "No utilizable".

import { describe, expect, it } from 'vitest';
import type { Caudal, Punto } from '../tipos/punto';
import { CAUDALES, esCaudalConocido } from './caudal';
import { CONFIG_POR_DEFECTO, radioPx } from './derivar';
import { claseChip, nombreCaudal } from './ficha';
import { cercanos, masCercanoQueNoFunciona } from './incidente';
import { filtrar, leerFiltro, ordenar } from './puntos';
import { COLOR_CAUDAL, svgMarcador } from './simbologia';
import { T } from './textos';

const BARRO = 'barro' as Caudal;
const O = { lat: 37.23, lng: -3.656 };
let n = 0;
const p = (m: number, caudal: Caudal = 'bueno'): Punto => ({
  id: `p${++n}`,
  codigo: `HID-${String(n).padStart(4, '0')}`,
  tipo: 'hidrante',
  diametro_mm: 100,
  caudal,
  racor: null,
  descripcion_fallo: null,
  descripcion: null,
  direccion: null,
  foto_path: null,
  municipio: 'albolote',
  nucleo: 'Albolote',
  fecha_ultima_revision: '2026-08-01',
  actualizado_en: '2026-09-01T00:00:00Z',
  lat: O.lat + m / 111_195,
  lng: O.lng,
  radio_px: 11,
  revision_caducada: false,
});

describe('Barro, un estado conocido (RV-102)', () => {
  it('es el cuarto de la escala, entre Malo y No funciona (FR-18)', () => {
    expect(esCaudalConocido('barro')).toBe(true);
    expect(CAUDALES).toEqual(['bueno', 'regular', 'malo', 'barro', 'no_funciona']);
    expect(nombreCaudal(BARRO)).toBe('Barro');
    expect(claseChip(BARRO)).toBe('bg-marron-100 text-marron-700');
  });

  it('marcador: tamaño mínimo, tachado y marrón, sin atenuar (FR-61)', () => {
    expect(radioPx(100, BARRO, CONFIG_POR_DEFECTO.escala_radios)).toBe(CONFIG_POR_DEFECTO.escala_radios[4]);
    const svg = svgMarcador({ tipo: 'hidrante', caudal: BARRO, radio_px: 5, revision_caducada: false });
    expect(svg).toContain(`fill="${COLOR_CAUDAL.barro}"`);
    expect(COLOR_CAUDAL.barro).toBe('var(--marron-600)');
    expect(svg).toContain('data-tachado');
    expect(svg).not.toContain('opacity="0.5"');
  });

  it('Cercanos no lo lista (FR-74: solo bueno y regular)', () => {
    const lista = [p(30, BARRO), p(60, 'regular')];
    expect(cercanos(lista, O, { soloHidrantes: false, metrosTramo: 20 }).map((c) => c.punto.caudal)).toEqual([
      'regular',
    ]);
  });

  it('si el más cercano tiene barro, el aviso lo dice', () => {
    const lista = [p(30, BARRO), p(600)];
    const c = cercanos(lista, O, { soloHidrantes: false, metrosTramo: 20 });
    expect(masCercanoQueNoFunciona(lista, O, { soloHidrantes: false }, c)?.punto.caudal).toBe('barro');
    expect(T.incidente.masCercanoBarro('HID-0001', '30 m')).toBe('El más cercano, HID-0001 a 30 m, tiene barro');
  });

  it('el filtro «No utilizable» recoge No funciona y Barro (FR-68)', () => {
    const lista = [p(1, BARRO), p(2, 'no_funciona'), p(3, 'malo'), p(4)];
    expect(filtrar(lista, 'no_utilizable').map((x) => x.caudal)).toEqual(['barro', 'no_funciona']);
    expect(T.mapa.noUtilizable).toBe('No utilizable');
  });

  it('en el orden por estado va entre Malo y No funciona', () => {
    const lista = [p(1, 'no_funciona'), p(2, BARRO), p(3, 'malo')];
    expect(ordenar(lista, 'estado', null).map((x) => x.caudal)).toEqual(['malo', 'barro', 'no_funciona']);
  });

  it('el filtro guardado «no_funciona» de la versión anterior se lee como «No utilizable»', () => {
    expect(leerFiltro('no_funciona')).toBe('no_utilizable');
    expect(leerFiltro('bocas')).toBe('bocas');
    expect(leerFiltro(null)).toBe('todos');
    expect(leerFiltro('x')).toBe('todos');
  });
});
