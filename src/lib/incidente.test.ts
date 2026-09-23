// Modo incidente: los más cercanos que funcionan (FR-74, TR-116; docs/18 GM-03).

import { describe, expect, it } from 'vitest';
import { leerLatLng as leerIncidente } from './coordenadas';
import { cercanos, masCercanoQueNoFunciona } from './incidente';
import type { Punto } from './puntos';

const O = { lat: 37.23, lng: -3.656 };
const alNorte = (m: number) => O.lat + m / 111_195;

let n = 0;
const p = (m: number, extra: Partial<Punto> = {}): Punto => ({
  id: `p${++n}`,
  codigo: `HID-${String(n).padStart(4, '0')}`,
  tipo: 'hidrante',
  diametro_mm: 100,
  caudal: 'bueno',
  racor: null,
  descripcion_fallo: null,
  descripcion: null,
  direccion: null,
  foto_path: null,
  municipio: 'albolote',
  nucleo: 'Albolote',
  fecha_ultima_revision: '2026-08-01',
  actualizado_en: '2026-09-01T00:00:00Z',
  lat: alNorte(m),
  lng: O.lng,
  radio_px: 11,
  revision_caducada: false,
  ...extra,
});

const OP = { soloHidrantes: false, metrosTramo: 20 };

describe('cercanos', () => {
  it('excluye malo y no funciona', () => {
    const lista = [p(50, { caudal: 'malo' }), p(60, { caudal: 'no_funciona' }), p(70), p(80, { caudal: 'regular' })];
    expect(cercanos(lista, O, OP).map((c) => c.punto.caudal)).toEqual(['bueno', 'regular']);
  });

  it('solo hidrantes excluye las bocas', () => {
    const lista = [p(40, { tipo: 'boca_riego', diametro_mm: 45 }), p(90)];
    expect(cercanos(lista, O, OP)).toHaveLength(2);
    expect(cercanos(lista, O, { ...OP, soloHidrantes: true }).map((c) => c.punto.tipo)).toEqual(['hidrante']);
  });

  it('ordena por distancia; a menos de 10 m, primero el de mayor radio', () => {
    const lejos = p(300);
    const cerca = p(100, { radio_px: 7 });
    const casiIgual = p(105, { radio_px: 11 });
    const orden = cercanos([lejos, cerca, casiIgual], O, OP).map((c) => c.punto.id);
    expect(orden).toEqual([casiIgual.id, cerca.id, lejos.id]);
  });

  it('como mucho cinco y como mucho a 2 km', () => {
    const lista = [...Array.from({ length: 8 }, (_, i) => p(100 * (i + 1))), p(2500)];
    const r = cercanos(lista, O, OP);
    expect(r).toHaveLength(5);
    expect(cercanos([p(2100)], O, OP)).toEqual([]);
    expect(cercanos([p(2100)], O, { ...OP, maxMetros: 3000 })).toHaveLength(1);
  });

  it('distancia, rumbo y tramos con la longitud de la config', () => {
    const [c] = cercanos([p(140)], O, { ...OP, metrosTramo: 20 });
    expect(c!.metros).toBeCloseTo(140, 0);
    expect(c!.rumbo).toBeCloseTo(0, 1);
    expect(c!.tramos).toBe(7);
    expect(cercanos([p(140)], O, { ...OP, metrosTramo: 25 })[0]!.tramos).toBe(6);
  });
});

describe('masCercanoQueNoFunciona', () => {
  it('avisa si el más cercano de todos no funciona y está antes que el primero que sí', () => {
    const roto = p(40, { caudal: 'no_funciona' });
    const lista = [roto, p(120)];
    const [primero] = cercanos(lista, O, OP);
    expect(masCercanoQueNoFunciona(lista, O, OP, primero)?.punto.id).toBe(roto.id);
  });

  it('si el más cercano funciona, no hay aviso', () => {
    const lista = [p(40), p(60, { caudal: 'malo' })];
    expect(masCercanoQueNoFunciona(lista, O, OP, cercanos(lista, O, OP)[0])).toBeNull();
  });

  it('sin ninguno que funcione, avisa del más cercano', () => {
    const lista = [p(30, { caudal: 'malo' })];
    expect(masCercanoQueNoFunciona(lista, O, OP, undefined)?.punto.caudal).toBe('malo');
  });
});

describe('rendimiento (TR-116)', () => {
  it('1.000 puntos en la zona: mediana de 20 ejecuciones por debajo de 20 ms', () => {
    let semilla = 42;
    const azar = () => ((semilla = (semilla * 16807) % 2147483647) - 1) / 2147483646;
    const muchos = Array.from({ length: 1000 }, (_, i) =>
      p(0, {
        id: `r${i}`,
        lat: 37.21 + azar() * 0.07,
        lng: -3.7 + azar() * 0.1,
        caudal: (['bueno', 'regular', 'malo', 'no_funciona'] as const)[i % 4]!,
      }),
    );
    const tiempos: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      cercanos(muchos, O, OP);
      tiempos.push(performance.now() - t0);
    }
    tiempos.sort((a, b) => a - b);
    expect(tiempos[10]!).toBeLessThan(20);
  });
});

describe('leerIncidente', () => {
  it('lee la URL y rechaza lo que no son coordenadas', () => {
    expect(leerIncidente('37.230500,-3.656000')).toEqual({ lat: 37.2305, lng: -3.656 });
    expect(leerIncidente('x,y')).toBeNull();
    expect(leerIncidente('37.2')).toBeNull();
    expect(leerIncidente(null)).toBeNull();
  });
});
