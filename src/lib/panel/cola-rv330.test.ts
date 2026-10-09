// docs/33 RV-330 (U15, D4): una propuesta sobre un punto que ya no está activo no se puede aprobar.

import { describe, expect, it } from 'vitest';
import {
  type PropuestaPanel,
  type PuntoCola,
  avisoPuntoInactivo,
  puntoInactivo,
  resumenLote,
  separarLote,
  tieneAviso,
} from './cola';
import { T } from '@/lib/textos';
import type { Operacion } from '@/lib/propuestas';

const PUNTO: PuntoCola = {
  codigo: 'HID-0147',
  tipo: 'hidrante',
  diametro_mm: 100,
  caudal: 'bueno',
  racor: null,
  descripcion: null,
  descripcion_fallo: null,
  direccion: 'C/ Real 14',
  nucleo: 'Albolote',
  fecha_ultima_revision: '2026-03-01',
  foto_path: null,
  foto_sitio_path: null,
  situacion: 'activo',
  borrado_en: null,
};

function propuesta(operacion: Operacion, punto: Partial<PuntoCola> | null, extra: Partial<PropuestaPanel> = {}) {
  const alta = operacion === 'alta';
  return {
    id: 'p1',
    operacion,
    estado: 'pendiente',
    creada_en: '2026-09-20T10:00:00Z',
    autor_nombre: 'Prueba',
    autor_apellido: 'Uno',
    punto_id: alta ? null : 'x1',
    codigo: alta ? null : 'HID-0147',
    datos: {},
    foto_path: null,
    direccion_sugerida: null,
    direccion_actual: null,
    lat: null,
    lng: null,
    antes: null,
    origen_ubicacion: null,
    precision_gps_m: null,
    distancia_gps_m: null,
    distancia_exif_m: null,
    fuera_de_zona: false,
    meses_desde_revision: null,
    duplicado_de: null,
    distancia_duplicado_m: null,
    codigo_duplicado: null,
    otra_medida: false,
    desactualizada: false,
    nucleo: 'Albolote',
    punto_actualizado_en: '2026-10-07T09:00:00Z',
    punto: punto ? { ...PUNTO, ...punto } : null,
    ...extra,
  } satisfies PropuestaPanel;
}

describe('puntoInactivo (RV-330)', () => {
  it('un punto activo no bloquea nada', () => {
    expect(puntoInactivo(propuesta('estado', {}))).toBeNull();
  });

  it.each(['revision', 'estado', 'datos', 'ubicacion'] as const)('%s sobre un punto retirado se bloquea', (op) => {
    expect(puntoInactivo(propuesta(op, { situacion: 'retirado' }))).toEqual({
      situacion: 'retirado',
      desde: '2026-10-07T09:00:00Z',
    });
  });

  it('en la papelera, la fecha es la de borrado', () => {
    expect(puntoInactivo(propuesta('datos', { situacion: 'borrado', borrado_en: '2026-10-05T08:00:00Z' }))).toEqual({
      situacion: 'borrado',
      desde: '2026-10-05T08:00:00Z',
    });
  });

  it('un alta y una retirada no se bloquean por la situación', () => {
    expect(puntoInactivo(propuesta('alta', null))).toBeNull();
    expect(puntoInactivo(propuesta('retirada', { situacion: 'retirado' }))).toBeNull();
  });

  it('sin la fila del punto (vista de antes) no se supone nada', () => {
    expect(puntoInactivo(propuesta('estado', null))).toBeNull();
  });
});

describe('avisoPuntoInactivo (RV-330)', () => {
  it('retirado, con la fecha', () => {
    expect(avisoPuntoInactivo({ situacion: 'retirado', desde: '2026-10-07T09:00:00Z' })).toBe(
      T.panelCola.avisoRetirado('7 oct 2026'),
    );
    expect(T.panelCola.avisoRetirado('7 oct 2026')).toBe(
      'Este punto ya no está activo (retirado el 7 oct 2026). La propuesta no se puede aprobar.',
    );
  });

  it('en la papelera, con la fecha', () => {
    expect(avisoPuntoInactivo({ situacion: 'borrado', desde: '2026-10-05T08:00:00Z' })).toBe(
      T.panelCola.avisoEnPapelera('5 oct 2026'),
    );
  });

  it('sin fecha (solo se sabe por PUNTO_NO_ACTIVO), sin paréntesis', () => {
    expect(avisoPuntoInactivo(null)).toBe(T.panelCola.avisoNoActivo);
    expect(avisoPuntoInactivo({ situacion: 'retirado', desde: null })).toBe(T.panelCola.avisoNoActivo);
  });
});

describe('la lista y el lote (RV-330)', () => {
  it('la fila de un punto que ya no está activo lleva ⚠', () => {
    expect(tieneAviso(propuesta('estado', {}))).toBe(false);
    expect(tieneAviso(propuesta('estado', { situacion: 'retirado' }))).toBe(true);
    expect(tieneAviso(propuesta('revision', { situacion: 'borrado' }))).toBe(true);
  });

  it('el lote salta las de un punto que ya no está activo y lo dice como omitidas', () => {
    const a = propuesta('revision', {}, { id: 'a' });
    const b = propuesta('estado', { situacion: 'retirado' }, { id: 'b' });
    const c = propuesta('alta', null, { id: 'c' });
    const { aprobables, saltadas } = separarLote([a, b, c]);
    expect(aprobables.map((p) => p.id)).toEqual(['a', 'c']);
    expect(saltadas).toEqual([{ propuesta_id: 'b', resultado: 'omitida', motivo: 'PUNTO_NO_ACTIVO' }]);
  });

  it('si todas se saltan, no dice "0 aprobadas": solo cuáles quedan y por qué', () => {
    const texto = resumenLote(
      [{ propuesta_id: 'b', resultado: 'omitida', motivo: 'PUNTO_NO_ACTIVO' }],
      () => 'Estado HID-0147',
    );
    expect(texto).toBe(T.panelCola.loteOmitidas(`Estado HID-0147: ${T.panelCola.omitidaPuntoNoActivo}`));
  });
});
