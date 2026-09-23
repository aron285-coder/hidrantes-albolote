import { describe, expect, it } from 'vitest';
import {
  POR_PAGINA,
  cambiosDe,
  caducadasPorNucleo,
  diasQueQuedan,
  escapar,
  inventario,
  nombreAccion,
  nucleosDe,
  ordenarPor,
  pagina,
  paginas,
  filtrosExportacion,
} from './inventario';
import type { Punto } from '../puntos';
import { T } from '../textos';

function punto(extra: Partial<Punto> = {}): Punto {
  return {
    id: extra.codigo ?? 'p1',
    codigo: 'HID-0001',
    tipo: 'hidrante',
    diametro_mm: 100,
    caudal: 'bueno',
    racor: null,
    descripcion_fallo: null,
    descripcion: null,
    direccion: 'Calle Real 14',
    foto_path: null,
    municipio: 'albolote',
    nucleo: 'Albolote',
    fecha_ultima_revision: '2026-08-20',
    actualizado_en: '2026-09-01T00:00:00Z',
    lat: 37.23,
    lng: -3.65,
    radio_px: 11,
    revision_caducada: false,
    ...extra,
  };
}

const PUNTOS = [
  punto({ codigo: 'HID-0001', nucleo: 'Albolote' }),
  punto({ codigo: 'HID-0002', diametro_mm: 70, caudal: 'no_funciona', nucleo: 'Pretel', revision_caducada: true }),
  punto({
    codigo: 'BOC-0003',
    tipo: 'boca_riego',
    diametro_mm: 45,
    racor: 'granada',
    caudal: 'regular',
    nucleo: 'Pretel',
  }),
  punto({ codigo: 'HID-0004', caudal: 'malo', nucleo: null, direccion: null, revision_caducada: true }),
];

const sinFiltro = {
  tipo: 'todos' as const,
  caudal: 'todos' as const,
  sin_revisar: false,
  nucleo: '',
  diametro: '',
  busqueda: '',
};

describe('inventario (FR-120)', () => {
  it('filtra por tipo, estado, caducidad, núcleo y diámetro', () => {
    expect(inventario(PUNTOS, { ...sinFiltro, tipo: 'hidrante' })).toHaveLength(3);
    expect(inventario(PUNTOS, { ...sinFiltro, tipo: 'boca_riego' })).toHaveLength(1);
    expect(inventario(PUNTOS, { ...sinFiltro, caudal: 'no_funciona' })).toHaveLength(1);
    expect(inventario(PUNTOS, { ...sinFiltro, sin_revisar: true })).toHaveLength(2);
    expect(inventario(PUNTOS, { ...sinFiltro, nucleo: 'Pretel' })).toHaveLength(2);
    expect(inventario(PUNTOS, { ...sinFiltro, diametro: '45' })).toHaveLength(1);
  });

  // FR-120: tipo **y** estado, combinables (RV-24).
  it('tipo y estado se combinan', () => {
    expect(inventario(PUNTOS, { ...sinFiltro, tipo: 'boca_riego', caudal: 'regular' }).map((p) => p.codigo)).toEqual([
      'BOC-0003',
    ]);
    expect(inventario(PUNTOS, { ...sinFiltro, tipo: 'boca_riego', caudal: 'malo' })).toEqual([]);
    expect(inventario(PUNTOS, { ...sinFiltro, tipo: 'hidrante', caudal: 'malo' }).map((p) => p.codigo)).toEqual([
      'HID-0004',
    ]);
  });

  it('sin revisar se combina con tipo', () => {
    expect(inventario(PUNTOS, { ...sinFiltro, tipo: 'hidrante', sin_revisar: true })).toHaveLength(2);
    expect(inventario(PUNTOS, { ...sinFiltro, tipo: 'boca_riego', sin_revisar: true })).toEqual([]);
  });

  it('los filtros del panel van a la exportación en la forma de fn_exportar_inventario', () => {
    expect(
      filtrosExportacion({ ...sinFiltro, tipo: 'hidrante', caudal: 'malo', sin_revisar: true, diametro: '70' }),
    ).toEqual({
      tipo: 'hidrante',
      caudal: 'malo',
      revision_caducada: true,
      diametro_mm: 70,
    });
    expect(filtrosExportacion(sinFiltro)).toEqual({});
  });

  it('la búsqueda global mira código, calle y núcleo, sin acentos (FR-145)', () => {
    expect(inventario(PUNTOS, { ...sinFiltro, busqueda: 'boc-0003' })).toHaveLength(1);
    expect(inventario(PUNTOS, { ...sinFiltro, busqueda: 'real' })).toHaveLength(3);
    expect(inventario(PUNTOS, { ...sinFiltro, busqueda: 'PRETEL' })).toHaveLength(2);
  });

  it('ordena por columna, con el estado de mejor a peor', () => {
    const porEstado = ordenarPor(PUNTOS, { columna: 'caudal', ascendente: true }).map((p) => p.caudal);
    expect(porEstado).toEqual(['bueno', 'regular', 'malo', 'no_funciona']);
    const porCodigo = ordenarPor(PUNTOS, { columna: 'codigo', ascendente: false }).map((p) => p.codigo);
    expect(porCodigo[0]).toBe('HID-0004');
    // Sin dirección no revienta ni se cuela por delante al ordenar al revés.
    expect(ordenarPor(PUNTOS, { columna: 'direccion', ascendente: true })[0].direccion).toBeNull();
  });

  it('pagina de 50 en 50', () => {
    const muchos = Array.from({ length: 120 }, (_, i) => punto({ codigo: `HID-${i}` }));
    expect(POR_PAGINA).toBe(50);
    expect(paginas(muchos.length)).toBe(3);
    expect(pagina(muchos, 2)).toHaveLength(20);
    expect(paginas(0)).toBe(1);
  });

  it('lista los núcleos presentes, ordenados y sin repetir', () => {
    expect(nucleosDe(PUNTOS)).toEqual(['Albolote', 'Pretel']);
  });
});

describe('editar un punto (FR-120, FR-151)', () => {
  it('manda solo lo que cambia', () => {
    const p = punto();
    expect(cambiosDe(p, { tipo: p.tipo, diametro_mm: 100, caudal: 'bueno', direccion: 'Calle Real 14' })).toEqual({});
    expect(cambiosDe(p, { caudal: 'malo' })).toEqual({ caudal: 'malo' });
    expect(cambiosDe(p, { direccion: '  ' })).toEqual({ direccion: null });
  });

  it('el racor solo viaja en bocas y el fallo solo con "No funciona"', () => {
    const p = punto();
    expect(cambiosDe(p, { tipo: 'boca_riego', racor: 'granada' })).toEqual({ tipo: 'boca_riego', racor: 'granada' });
    expect(cambiosDe(p, { caudal: 'no_funciona', descripcion_fallo: 'Tapa soldada' })).toEqual({
      caudal: 'no_funciona',
      descripcion_fallo: 'Tapa soldada',
    });
    expect(cambiosDe(p, { caudal: 'malo', descripcion_fallo: 'da igual' })).toEqual({ caudal: 'malo' });
  });
});

describe('papelera (FR-124)', () => {
  it('cuenta los días que quedan y nunca baja de cero', () => {
    const ahora = new Date('2026-09-20T12:00:00Z');
    expect(diasQueQuedan('2026-09-18T12:00:00Z', 30, ahora)).toBe(28);
    expect(diasQueQuedan('2026-07-01T12:00:00Z', 30, ahora)).toBe(0);
  });
});

describe('revisiones caducadas (FR-121)', () => {
  it('agrupa por núcleo, de más urgente a menos, con el total del núcleo', () => {
    const grupos = caducadasPorNucleo([
      ...PUNTOS,
      punto({ codigo: 'HID-0005', nucleo: 'Pretel', revision_caducada: true }),
    ]);
    expect(grupos.map((g) => [g.nucleo, g.puntos.length, g.total])).toEqual([
      ['Pretel', 2, 3],
      [T.panelCola.sinNucleo, 1, 1],
    ]);
  });
});

describe('registro (FR-123)', () => {
  it('traduce el vocabulario de acciones de 05 §8', () => {
    expect(nombreAccion('aprobacion_con_correcciones')).toBe(T.panelRegistro.aprobacionCorrecciones);
    expect(nombreAccion('lo_que_sea')).toBe('lo_que_sea');
  });

  it('la búsqueda no puede romper el filtro del servidor', () => {
    expect(escapar('  pepe%,(*)"  ')).toBe('pepe');
  });
});
