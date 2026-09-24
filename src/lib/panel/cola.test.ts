import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcPanel, pedirEnvioComoJefatura } = vi.hoisted(() => ({
  rpcPanel: vi.fn(),
  pedirEnvioComoJefatura: vi.fn(async () => undefined),
}));
vi.mock('../api', async (original) => ({ ...(await original<typeof import('../api')>()), rpc: rpcPanel }));
vi.mock('./push-jefatura', () => ({ pedirEnvioComoJefatura }));
vi.mock('../puntos', async (original) => ({
  ...(await original<typeof import('../puntos')>()),
  sincronizar: vi.fn(async () => ({ ok: true, datos: null })),
}));

import {
  aprobar,
  aprobarLote,
  rechazar,
  rechazarLote,
  type PropuestaPanel,
  coincide,
  conDireccion,
  correccionesDe,
  diferenciasFusion,
  faltaEnCorrecciones,
  filasDiff,
  lineaCola,
  motivoOmitida,
  resumenLote,
  senales,
  tieneAviso,
  valoresPropuestos,
} from './cola';
import { textoError } from './errores';
import type { Punto } from '../puntos';
import { T } from '../textos';

const AHORA = new Date('2026-09-20T12:00:00Z');

function propuesta(extra: Partial<PropuestaPanel> = {}): PropuestaPanel {
  return {
    id: 'p1',
    operacion: 'estado',
    estado: 'pendiente',
    creada_en: '2026-09-20T10:00:00Z',
    autor_nombre: 'Sara',
    autor_apellido: 'Ruiz',
    punto_id: 'x1',
    codigo: 'HID-0147',
    datos: { caudal: 'regular' },
    foto_path: 'fotos/a.jpg',
    direccion_sugerida: null,
    direccion_actual: 'C/ Real 14',
    lat: null,
    lng: null,
    antes: { caudal: 'bueno' },
    origen_ubicacion: null,
    precision_gps_m: null,
    distancia_gps_m: null,
    distancia_exif_m: null,
    fuera_de_zona: null,
    meses_desde_revision: 3,
    duplicado_de: null,
    distancia_duplicado_m: null,
    codigo_duplicado: null,
    otra_medida: false,
    desactualizada: false,
    nucleo: 'Albolote',
    punto_actualizado_en: '2026-06-01T00:00:00Z',
    ...extra,
  };
}

const PUNTO: Punto = {
  id: 'x1',
  codigo: 'HID-0147',
  tipo: 'hidrante',
  diametro_mm: 100,
  caudal: 'bueno',
  racor: null,
  descripcion_fallo: null,
  descripcion: 'Junto al bar',
  direccion: 'C/ Real 14',
  foto_path: 'fotos/v.jpg',
  municipio: 'albolote',
  nucleo: 'Albolote',
  fecha_ultima_revision: '2025-06-01',
  actualizado_en: '2026-06-01T00:00:00Z',
  lat: 37.23,
  lng: -3.656,
  radio_px: 11,
  revision_caducada: true,
};

describe('lista de la cola', () => {
  it('sigue la notación canónica "Autor · hace 2 h · dirección · núcleo" (UI-11)', () => {
    expect(lineaCola(propuesta(), AHORA)).toBe('Sara Ruiz · hace 2 h · C/ Real 14 · Albolote');
  });

  it('sin dirección ni núcleo lo dice, nunca un hueco', () => {
    const p = propuesta({ direccion_actual: null, nucleo: null, fuera_de_zona: true });
    expect(lineaCola(p, AHORA)).toBe(`Sara Ruiz · hace 2 h · ${T.ficha.sinDireccion} · ${T.panelCola.fueraDeZona}`);
  });

  it('la búsqueda global encuentra por código, calle y autor, sin acentos (FR-145)', () => {
    const p = propuesta({ autor_nombre: 'Ángela' });
    expect(coincide(p, 'hid-0147')).toBe(true);
    expect(coincide(p, 'real')).toBe(true);
    expect(coincide(p, 'angela')).toBe(true);
    expect(coincide(p, 'loja')).toBe(false);
    expect(coincide(p, '  ')).toBe(true);
  });
});

describe('diff (FR-102)', () => {
  it('cambio de estado: antes tachado y después', () => {
    expect(filasDiff(propuesta())).toEqual([{ campo: 'Estado', antes: 'Bueno', despues: 'Regular' }]);
  });

  it('alta: todo es nuevo y "otra medida" se ve tal cual', () => {
    const p = propuesta({
      operacion: 'alta',
      punto_id: null,
      antes: null,
      datos: { tipo: 'hidrante', diametro_otro: 80, caudal: 'no_funciona', descripcion_fallo: 'Tapa soldada' },
    });
    expect(filasDiff(p)).toEqual([
      { campo: 'Tipo', despues: 'Hidrante' },
      { campo: 'Diámetro', despues: 'Otra medida: 80 mm' },
      { campo: 'Estado', despues: 'No funciona' },
      { campo: 'Fallo', despues: '"Tapa soldada"' },
    ]);
  });

  it('revisión: el estado sigue igual y la fecha cambia', () => {
    const filas = filasDiff(propuesta({ operacion: 'revision', datos: {}, antes: null }), PUNTO);
    expect(filas[0]).toEqual({ campo: 'Estado', despues: 'Bueno · sin cambios', sinCambios: true });
    expect(filas[1].campo).toBe('Revisión');
    expect(filas[1].antes).toBe('1 jun 2025');
  });

  it('corregir datos: solo los campos que cambian', () => {
    const p = propuesta({ operacion: 'datos', datos: { diametro_mm: 70 }, antes: { diametro_mm: 100 } });
    expect(filasDiff(p)).toEqual([{ campo: 'Diámetro', antes: '100 mm', despues: '70 mm' }]);
  });

  it('ubicación: el desplazamiento en metros', () => {
    const p = propuesta({ operacion: 'ubicacion', datos: {}, antes: null, lat: 37.2301, lng: -3.656 });
    expect(filasDiff(p, PUNTO)).toEqual([{ campo: 'Desplazamiento', despues: '11 m' }]);
  });

  it('retirada: situación y motivo', () => {
    const p = propuesta({ operacion: 'retirada', datos: { motivo_rapido: 'obras', motivo: 'Calle levantada' } });
    expect(filasDiff(p)).toEqual([
      { campo: 'Situación', antes: 'Activo', despues: 'Retirado' },
      { campo: 'Motivo', despues: 'Obras · "Calle levantada"' },
    ]);
  });
});

describe('señales (FR-104)', () => {
  it('GPS en campo con buena precisión: sin avisos', () => {
    const s = senales(propuesta({ origen_ubicacion: 'gps', precision_gps_m: 4, distancia_gps_m: 6 }));
    expect(s.map((x) => x.texto)).toContain('GPS en campo · ±4 m · a 6 m del pin');
    expect(s.some((x) => x.aviso)).toBe(false);
    expect(tieneAviso(propuesta({ origen_ubicacion: 'gps', precision_gps_m: 4 }))).toBe(false);
  });

  it('pin manual, GPS impreciso, foto lejos, fuera de zona, duplicado, otra medida y desactualizada avisan', () => {
    const p = propuesta({
      origen_ubicacion: 'manual',
      distancia_gps_m: 40,
      precision_gps_m: 35,
      distancia_exif_m: 120,
      fuera_de_zona: true,
      duplicado_de: 'x2',
      codigo_duplicado: 'BOC-0088',
      distancia_duplicado_m: 8,
      otra_medida: true,
      desactualizada: true,
    });
    const avisos = senales(p)
      .filter((x) => x.aviso)
      .map((x) => x.texto);
    expect(avisos).toEqual([
      'Pin puesto a mano · a 40 m del GPS del móvil',
      'GPS poco preciso · ±35 m',
      'La foto se hizo a 120 m del pin',
      'Fuera de zona',
      'Posible duplicado de BOC-0088 · a 8 m',
      T.panelCola.senalOtraMedida,
      T.panelCola.senalDesactualizada,
    ]);
    expect(tieneAviso(p)).toBe(true);
  });

  it('antigüedad de la revisión anterior', () => {
    expect(senales(propuesta({ meses_desde_revision: 14 })).map((x) => x.texto)).toContain(
      'Revisión anterior: hace 14 meses',
    );
  });
});

describe('aprobar con correcciones (FR-106)', () => {
  it('lo propuesto parte del punto actual con lo que cambia la propuesta', () => {
    expect(valoresPropuestos(propuesta(), PUNTO)).toEqual({
      tipo: 'hidrante',
      diametro_mm: 100,
      caudal: 'regular',
      racor: null,
      descripcion_fallo: '',
      descripcion: 'Junto al bar',
    });
  });

  it('las correcciones son solo lo que jefatura cambia', () => {
    const base = valoresPropuestos(propuesta(), PUNTO);
    expect(correccionesDe(base, base)).toEqual({});
    expect(correccionesDe(base, { ...base, caudal: 'malo', descripcion: ' Junto al bar ' })).toEqual({
      caudal: 'malo',
    });
    expect(correccionesDe(base, { ...base, tipo: 'boca_riego', diametro_mm: 45, racor: 'granada' })).toEqual({
      tipo: 'boca_riego',
      racor: 'granada',
    });
  });

  it('"otra medida" obliga a fijar 70 o 100 (FR-17)', () => {
    const p = propuesta({ operacion: 'alta', datos: { tipo: 'hidrante', diametro_otro: 80, caudal: 'bueno' } });
    const v = valoresPropuestos(p);
    expect(v.diametro_mm).toBeNull();
    expect(faltaEnCorrecciones(v)).toBe(T.panelCola.fijaDiametro);
    expect(faltaEnCorrecciones({ ...v, diametro_mm: 70 })).toBeNull();
    expect(correccionesDe(v, { ...v, diametro_mm: 70 })).toEqual({ diametro_mm: 70 });
  });

  it('boca sin racor y "No funciona" sin fallo no se pueden guardar', () => {
    const v = valoresPropuestos(propuesta(), PUNTO);
    expect(faltaEnCorrecciones({ ...v, tipo: 'boca_riego', diametro_mm: 45, racor: null })).toBe(
      T.avisosFormulario.eligeRacor,
    );
    expect(faltaEnCorrecciones({ ...v, caudal: 'no_funciona', descripcion_fallo: ' ' })).toBe(
      T.avisosFormulario.describeFallo,
    );
  });

  it('la dirección escrita va en las correcciones solo si difiere de la deducida (FR-105)', () => {
    expect(conDireccion({}, 'C/ Real 14', 'C/ Real 14')).toEqual({});
    expect(conDireccion({}, '  ', null)).toEqual({});
    expect(conDireccion({ caudal: 'malo' }, 'C/ Real 16', 'C/ Real 14')).toEqual({
      caudal: 'malo',
      direccion: 'C/ Real 16',
    });
  });
});

describe('fusionar (FR-51)', () => {
  it('la descripción también se elige cuando difiere (RV-18, FR-106)', () => {
    const p = propuesta({
      operacion: 'alta',
      datos: { tipo: 'hidrante', diametro_mm: 100, caudal: 'bueno', descripcion: 'Junto a la farmacia' },
    });
    expect(diferenciasFusion(p, { ...PUNTO, descripcion: 'Esquina' })).toContainEqual({
      campo: 'descripcion',
      propuesta: 'Junto a la farmacia',
      existente: 'Esquina',
    });
    expect(diferenciasFusion(p, { ...PUNTO, descripcion: 'Junto a la farmacia' }).map((d) => d.campo)).not.toContain(
      'descripcion',
    );
  });

  it('lista lo que difiere y siempre la ubicación', () => {
    const p = propuesta({
      operacion: 'alta',
      datos: { tipo: 'hidrante', diametro_mm: 100, caudal: 'regular' },
      lat: 37.2301,
      lng: -3.656,
    });
    expect(diferenciasFusion(p, PUNTO)).toEqual([
      { campo: 'caudal', propuesta: 'Regular', existente: 'Bueno' },
      { campo: 'ubicacion', propuesta: 'la del pin propuesto (a 11 m)', existente: 'la de HID-0147 (existente)' },
    ]);
  });
});

describe('aprobación en bloque (FR-107)', () => {
  it('dice cuántas se aprobaron y cuál quedó fuera y por qué', () => {
    const texto = resumenLote(
      [
        { propuesta_id: 'a', resultado: 'aprobada', motivo: null },
        { propuesta_id: 'b', resultado: 'omitida', motivo: 'PROPUESTA_DESACTUALIZADA' },
      ],
      (id) => (id === 'b' ? 'Estado HID-0044' : id),
    );
    expect(texto).toBe(
      '1 aprobadas, cada una con su entrada en el Registro. Quedan pendientes: Estado HID-0044: desactualizada.',
    );
  });

  it('cada código de omisión tiene su motivo en palabras', () => {
    expect(motivoOmitida('PUNTO_NO_ACTIVO')).toBe(T.panelCola.omitidaPuntoNoActivo);
    expect(motivoOmitida('DIAMETRO_SIN_FIJAR')).toBe(T.panelCola.omitidaDiametro);
    expect(motivoOmitida('PROPUESTA_NO_PENDIENTE')).toBe(T.panelCola.omitidaYaResuelta);
    expect(motivoOmitida('PAYLOAD_INVALIDO(puntos_diametro)')).toBe(T.panelCola.omitidaDatos);
  });
});

describe('errores en palabras (TR-36)', () => {
  it('ningún código llega crudo a la pantalla', () => {
    for (const c of [
      'PROPUESTA_NO_PENDIENTE',
      'PAYLOAD_INVALIDO(correcciones)',
      'CONFIG_INVALIDA(meses_revision)',
      'X',
    ]) {
      expect(textoError(c)).not.toMatch(/[A-Z]{3,}_/);
    }
    expect(textoError('ULTIMO_ADMINISTRADOR')).toBe(T.panel.ultimoAdministrador);
  });
});

describe('moderar pide el envío de avisos (RV-08, FR-163)', () => {
  beforeEach(() => {
    rpcPanel.mockReset();
    pedirEnvioComoJefatura.mockClear();
  });

  it('aprobar pide el envío de avisos una vez', async () => {
    rpcPanel.mockResolvedValue({ ok: true, datos: { punto_id: 'x', codigo: 'HID-0001' } });
    await aprobar('p1', null, false);
    expect(pedirEnvioComoJefatura).toHaveBeenCalledTimes(1);
  });

  it('un lote pide el envío una sola vez', async () => {
    rpcPanel.mockResolvedValue({ ok: true, datos: [{ propuesta_id: 'a', resultado: 'aprobada', motivo: null }] });
    await aprobarLote(['a', 'b', 'c']);
    expect(pedirEnvioComoJefatura).toHaveBeenCalledTimes(1);
    rpcPanel.mockResolvedValue({ ok: true, datos: null });
    pedirEnvioComoJefatura.mockClear();
    await rechazarLote(['a', 'b', 'c'], 'Duplicado');
    expect(pedirEnvioComoJefatura).toHaveBeenCalledTimes(1);
  });

  it('rechazar una también avisa; si falla, no', async () => {
    rpcPanel.mockResolvedValueOnce({ ok: true, datos: null });
    await rechazar('p1', 'No es un hidrante');
    expect(pedirEnvioComoJefatura).toHaveBeenCalledTimes(1);
    rpcPanel.mockResolvedValueOnce({ ok: false, codigo: 'PROPUESTA_NO_PENDIENTE' });
    await rechazar('p2', 'x');
    expect(pedirEnvioComoJefatura).toHaveBeenCalledTimes(1);
  });
});
