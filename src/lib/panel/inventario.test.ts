import { describe, expect, it } from 'vitest';
import {
  POR_PAGINA,
  cambiosDe,
  caducadasPorNucleo,
  diasQueQuedan,
  escapar,
  inventario,
  nombreAccion,
  cuentaPorEstado,
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
  busqueda: '',
};

describe('inventario (FR-120)', () => {
  it('filtra por tipo y por estado', () => {
    expect(inventario(PUNTOS, { ...sinFiltro, tipo: 'hidrante' })).toHaveLength(3);
    expect(inventario(PUNTOS, { ...sinFiltro, tipo: 'boca_riego' })).toHaveLength(1);
    expect(inventario(PUNTOS, { ...sinFiltro, caudal: 'no_funciona' })).toHaveLength(1);
  });

  // docs/29 RV-123 (DEC-168): solo Tipo y Estado. Un filtro de antes (núcleo, diámetro, revisión)
  // que llegue en el objeto se ignora sin error.
  it('los filtros quitados ya no filtran ni van a la exportación (RV-123)', () => {
    const viejo = { ...sinFiltro, sin_revisar: true, nucleo: 'Pretel', diametro: '45' };
    expect(inventario(PUNTOS, viejo)).toHaveLength(PUNTOS.length);
    expect(filtrosExportacion(viejo)).toEqual({});
  });

  it('cuenta cada estado según el filtro de tipo, para el desplegable (RV-123)', () => {
    expect(cuentaPorEstado(PUNTOS, 'todos')).toEqual({
      todos: 4,
      bueno: 1,
      regular: 1,
      malo: 1,
      barro: 0,
      no_funciona: 1,
    });
    expect(cuentaPorEstado(PUNTOS, 'boca_riego')).toEqual({
      todos: 1,
      bueno: 0,
      regular: 1,
      malo: 0,
      barro: 0,
      no_funciona: 0,
    });
    // Un estado que esta versión no conoce cuenta como no funciona, igual que se dibuja (RV-102a).
    const raro = punto({ codigo: 'HID-0009', caudal: 'desconocido' as Punto['caudal'] });
    expect(cuentaPorEstado([raro], 'hidrante').no_funciona).toBe(1);
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

  it('los filtros del panel van a la exportación en la forma de fn_exportar_inventario', () => {
    expect(filtrosExportacion({ ...sinFiltro, tipo: 'hidrante', caudal: 'malo' })).toEqual({
      tipo: 'hidrante',
      caudal: 'malo',
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

  // RV-123: núcleo, diámetro y última revisión ya no filtran; se ordenan por columna.
  it('ordena por núcleo, diámetro y última revisión', () => {
    expect(ordenarPor(PUNTOS, { columna: 'nucleo', ascendente: true }).map((p) => p.nucleo)).toEqual([
      null,
      'Albolote',
      'Pretel',
      'Pretel',
    ]);
    expect(ordenarPor(PUNTOS, { columna: 'diametro_mm', ascendente: false }).map((p) => p.diametro_mm)).toEqual([
      100, 100, 70, 45,
    ]);
    const conFechas = [
      punto({ codigo: 'HID-0007', fecha_ultima_revision: '2026-01-02' }),
      punto({ codigo: 'HID-0008', fecha_ultima_revision: '2025-06-30' }),
    ];
    expect(ordenarPor(conFechas, { columna: 'fecha_ultima_revision', ascendente: true }).map((p) => p.codigo)).toEqual([
      'HID-0008',
      'HID-0007',
    ]);
  });

  it('pagina de 50 en 50', () => {
    const muchos = Array.from({ length: 120 }, (_, i) => punto({ codigo: `HID-${i}` }));
    expect(POR_PAGINA).toBe(50);
    expect(paginas(muchos.length)).toBe(3);
    expect(pagina(muchos, 2)).toHaveLength(20);
    expect(paginas(0)).toBe(1);
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
    // El tipo no se cambia desde el inventario (DEC-090, docs/18 RV-41).
    expect(cambiosDe(p, { tipo: 'boca_riego', racor: 'granada' })).toEqual({});
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
