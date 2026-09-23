// Réplica en el móvil de fn_radio_px y de revision_caducada (RV-05). La paridad con el servidor de
// verdad se comprueba en e2e/integracion/derivar.spec.ts contra la pila local.

import { describe, expect, it } from 'vitest';
import type { Caudal } from '../tipos/punto';
import { CONFIG_POR_DEFECTO, type EscalaRadios, derivar, leerConfig, radioPx, revisionCaducada } from './derivar';

const POR_DEFECTO = CONFIG_POR_DEFECTO.escala_radios;
const OTRA: EscalaRadios = [20, 15, 10, 6, 3];

// [diámetro, caudal, índice de la escala que sale en fn_radio_px]
const TABLA: [number, Caudal, number][] = [
  [100, 'bueno', 0],
  [100, 'regular', 1],
  [100, 'malo', 2],
  [100, 'no_funciona', 4],
  [70, 'bueno', 1],
  [70, 'regular', 2],
  [70, 'malo', 3],
  [70, 'no_funciona', 4],
  [45, 'bueno', 2],
  [45, 'regular', 3],
  [45, 'malo', 3],
  [45, 'no_funciona', 4],
  [80, 'bueno', 4],
  [80, 'regular', 4],
  [80, 'malo', 4],
  [80, 'no_funciona', 4],
];

describe('radioPx (réplica de fn_radio_px)', () => {
  it.each(TABLA)('%i mm %s → índice %i con la escala por defecto y con otra', (d, caudal, indice) => {
    expect(radioPx(d, caudal, POR_DEFECTO)).toBe(POR_DEFECTO[indice]);
    expect(radioPx(d, caudal, OTRA)).toBe(OTRA[indice]);
  });
});

describe('revisionCaducada (réplica de current_date - make_interval(months))', () => {
  const hoy = new Date(2026, 2, 31); // 31 mar 2026
  it('la resta de meses se queda en el último día del mes, como Postgres', () => {
    expect(revisionCaducada('2026-02-28', 1, hoy)).toBe(false);
    expect(revisionCaducada('2026-02-27', 1, hoy)).toBe(true);
  });
  it('año bisiesto: 31 mar 2028 − 1 mes = 29 feb', () => {
    const bisiesto = new Date(2028, 2, 31);
    expect(revisionCaducada('2028-02-29', 1, bisiesto)).toBe(false);
    expect(revisionCaducada('2028-02-28', 1, bisiesto)).toBe(true);
  });
  it('el límite exacto no está caducado: la comparación es estricta', () => {
    const d = new Date(2026, 8, 23);
    expect(revisionCaducada('2025-09-23', 12, d)).toBe(false);
    expect(revisionCaducada('2025-09-22', 12, d)).toBe(true);
  });
  it('cruza el año hacia atrás', () => {
    expect(revisionCaducada('2025-12-14', 3, new Date(2026, 2, 15))).toBe(true);
    expect(revisionCaducada('2025-12-15', 3, new Date(2026, 2, 15))).toBe(false);
  });
});

describe('leerConfig', () => {
  it('acepta la config de fn_listar_puntos', () => {
    expect(leerConfig({ meses_revision: 6, escala_radios: [12, 10, 8, 6, 4], radio_duplicado_m: 25 })).toEqual({
      meses_revision: 6,
      escala_radios: [12, 10, 8, 6, 4],
    });
  });
  it.each([
    null,
    undefined,
    'x',
    3,
    {},
    { meses_revision: 12 },
    { meses_revision: 'doce', escala_radios: [1, 2, 3, 4, 5] },
    { meses_revision: 12, escala_radios: [1, 2, 3] },
    { meses_revision: 12, escala_radios: [1, 2, 'x', 4, 5] },
    { meses_revision: 0, escala_radios: [1, 2, 3, 4, 5] },
  ])('con basura devuelve null: %j', (bruta) => expect(leerConfig(bruta)).toBeNull());
});

describe('derivar', () => {
  it('recalcula los dos campos y deja el resto', () => {
    const p = {
      id: '1',
      codigo: 'HID-0001',
      tipo: 'hidrante' as const,
      diametro_mm: 70,
      caudal: 'regular' as const,
      racor: null,
      descripcion_fallo: null,
      descripcion: 'x',
      direccion: null,
      foto_path: null,
      municipio: 'albolote',
      nucleo: null,
      fecha_ultima_revision: '2025-01-01',
      actualizado_en: '2025-01-01T00:00:00Z',
      lat: 1,
      lng: 2,
      radio_px: 99,
      revision_caducada: false,
    };
    expect(derivar(p, CONFIG_POR_DEFECTO, new Date(2026, 8, 23))).toEqual({
      ...p,
      radio_px: 7,
      revision_caducada: true,
    });
  });
});
