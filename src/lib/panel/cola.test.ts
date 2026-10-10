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
  fusionar,
  aprobarLote,
  rechazar,
  rechazarLote,
  type PropuestaPanel,
  coincide,
  conDireccion,
  correccionesDe,
  diferenciasFusion,
  faltaEnCorrecciones,
  fichaCompleta,
  lineaCola,
  motivoOmitida,
  resumenLote,
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

// El diff vive dentro de "Datos del punto" desde docs/25 RV-110: lo que cambia va primero.
describe('diff (FR-102)', () => {
  const cambios = (p: PropuestaPanel, punto?: Punto) =>
    fichaCompleta(p, punto)
      .campos.filter((c) => c.cambia)
      .map(({ etiqueta, antes, valor }) => (antes === undefined ? { etiqueta, valor } : { etiqueta, antes, valor }));

  it('cambio de estado: antes tachado y después', () => {
    expect(cambios(propuesta({ foto_path: null }))).toEqual([{ etiqueta: 'Estado', antes: 'Bueno', valor: 'Regular' }]);
  });

  it('alta: todo es nuevo y "otra medida" se ve tal cual', () => {
    const p = propuesta({
      operacion: 'alta',
      punto_id: null,
      antes: null,
      datos: { tipo: 'hidrante', diametro_otro: 80, caudal: 'no_funciona', descripcion_fallo: 'Tapa soldada' },
    });
    expect(cambios(p)).toEqual([
      { etiqueta: 'Tipo', valor: 'Hidrante' },
      { etiqueta: 'Diámetro', valor: 'Otra medida: 80 mm' },
      { etiqueta: 'Estado', valor: 'No funciona' },
      { etiqueta: 'Fallo', valor: 'Tapa soldada' },
    ]);
  });

  it('revisión: el estado sigue igual y la fecha cambia', () => {
    const f = fichaCompleta(propuesta({ operacion: 'revision', datos: {}, antes: null }), PUNTO);
    expect(f.campos[0]).toMatchObject({ clave: 'revision', antes: '1 jun 2025', cambia: true });
    expect(f.campos.find((c) => c.clave === 'caudal')).toMatchObject({ valor: 'Bueno', cambia: false });
  });

  it('corregir datos: solo los campos que cambian', () => {
    const p = propuesta({ operacion: 'datos', datos: { diametro_mm: 70 }, antes: { diametro_mm: 100 } });
    expect(cambios(p)).toEqual([{ etiqueta: 'Diámetro', antes: '100 mm', valor: '70 mm' }]);
  });

  it('ubicación: cambian las coordenadas, de las del punto a las del pin', () => {
    const p = propuesta({ operacion: 'ubicacion', datos: {}, antes: null, lat: 37.2301, lng: -3.656 });
    expect(cambios(p, PUNTO)[0]).toEqual({
      etiqueta: T.coordenadas.decimal,
      antes: '37.230000, -3.656000',
      valor: '37.230100, -3.656000',
    });
  });

  it('retirada: situación y motivo', () => {
    const p = propuesta({ operacion: 'retirada', datos: { motivo_rapido: 'obras', motivo: 'Calle levantada' } });
    const f = fichaCompleta(p);
    expect(f.campos[0]).toMatchObject({ etiqueta: 'Situación', antes: 'Activo', valor: 'Retirado' });
    expect(f.campos[1]).toMatchObject({ etiqueta: 'Motivo', valor: 'Obras · "Calle levantada"' });
  });
});

// docs/28 RV-115 (DEC-166): el ⚠ de la lista, solo por lo que el detalle enseña como aviso.
describe('el ⚠ de la lista de la cola (FR-104, DEC-166)', () => {
  it.each([
    ['desactualizada', { desactualizada: true }],
    ['un hidrante de otra medida', { otra_medida: true }],
    ['posible duplicado', { duplicado_de: 'x2', codigo_duplicado: 'BOC-0088', distancia_duplicado_m: 8 }],
    ['fuera de zona', { fuera_de_zona: true }],
  ] as [string, Partial<PropuestaPanel>][])('avisa: %s', (_, extra) => {
    expect(tieneAviso(propuesta(extra))).toBe(true);
  });

  it.each([
    ['pin puesto a mano', { origen_ubicacion: 'manual', distancia_gps_m: 40 }],
    ['foto lejos del pin', { distancia_exif_m: 120 }],
    ['GPS poco preciso', { origen_ubicacion: 'gps', precision_gps_m: 35 }],
    ['sin foto del sitio', { sin_foto_sitio: true }],
  ] as [string, Partial<PropuestaPanel>][])('no avisa: solo %s', (_, extra) => {
    expect(tieneAviso(propuesta(extra))).toBe(false);
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
    // El diámetro va también: con bocas de otra medida (docs/24 RV-101), el servidor tomaría el 100 del
    // hidrante propuesto como diámetro de la boca.
    expect(correccionesDe(base, { ...base, tipo: 'boca_riego', diametro_mm: 45, racor: 'granada' })).toEqual({
      tipo: 'boca_riego',
      diametro_mm: 45,
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

  it('la dirección escrita va en las correcciones solo si difiere de la enseñada al abrir (FR-105)', () => {
    expect(conDireccion({}, 'C/ Real 14', 'C/ Real 14')).toEqual({});
    expect(conDireccion({}, '  ', null)).toEqual({});
    expect(conDireccion({}, '  ', '')).toEqual({});
    expect(conDireccion({ caudal: 'malo' }, 'C/ Real 16', 'C/ Real 14')).toEqual({
      caudal: 'malo',
      direccion: 'C/ Real 16',
    });
  });

  // docs/31 RV-162: aprobar no se registra "con correcciones" si nadie ha corregido.
  it('caso 1: la deducida al abrir, sin tocar, no es una corrección', () => {
    // La propuesta llegó sin dirección y el panel la dedujo: se compara con lo enseñado, no con null.
    expect(conDireccion({}, 'Camino del Cubillas 2', 'Camino del Cubillas 2')).toEqual({});
    expect(conDireccion({}, ' Camino del Cubillas 2 ', 'Camino del Cubillas 2')).toEqual({});
  });

  it('caso 2: la dirección actual que rellena el formulario, sin tocar, no va en las correcciones', () => {
    expect(conDireccion({ caudal: 'malo' }, 'Calle Real 14', 'Calle Real 14')).toEqual({ caudal: 'malo' });
  });

  it('caso 3: vaciar la dirección manda null para quitarla', () => {
    expect(conDireccion({}, '', 'Calle Real 14')).toEqual({ direccion: null });
    expect(conDireccion({ caudal: 'malo' }, '   ', 'Calle Real 14')).toEqual({ caudal: 'malo', direccion: null });
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
      '1 aprobada, con su entrada en el Registro. Quedan pendientes: Estado HID-0044: desactualizada.',
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

describe('fusionar con la dirección editada (docs/32 RV-253, 0041)', () => {
  beforeEach(() => rpcPanel.mockReset().mockResolvedValue({ ok: true, datos: { punto_id: 'x', codigo: 'BOC-0001' } }));

  it('la dirección escrita va en prevalece.direccion', async () => {
    await fusionar('p1', 'x', { caudal: 'propuesta' }, 'Calle Fuente 5');
    expect(rpcPanel).toHaveBeenCalledWith('fn_fusionar_con_existente', {
      propuesta_id: 'p1',
      punto_id: 'x',
      prevalece: { caudal: 'propuesta', direccion: 'Calle Fuente 5' },
    });
  });

  it('vaciada, manda null; sin tocarla, ni la clave (el servidor hace lo de antes)', async () => {
    await fusionar('p1', 'x', {}, null);
    expect(rpcPanel.mock.calls[0]![1]).toMatchObject({ prevalece: { direccion: null } });
    await fusionar('p1', 'x', {});
    expect(rpcPanel.mock.calls[1]![1]).toEqual({ propuesta_id: 'p1', punto_id: 'x', prevalece: {} });
  });
});
