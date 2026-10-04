// docs/25 RV-110: el detalle de la cola enseña todos los datos del punto, con lo que cambia primero
// y marcado; el mapa sale en las seis operaciones y las fotos comparan la actual con las nuevas.

import { describe, expect, it } from 'vitest';
import { type PropuestaPanel, type PuntoCola, desdeHistorial, fichaCompleta, fotosDe, planMapa } from './cola';
import type { Operacion } from '../propuestas';
import type { Punto } from '../puntos';
import { T } from '../textos';

const ACTUAL: PuntoCola = {
  codigo: 'HID-9001',
  tipo: 'hidrante',
  diametro_mm: 100,
  caudal: 'bueno',
  racor: null,
  descripcion: '[PRUEBA] Esquina con la plaza',
  descripcion_fallo: null,
  direccion: 'Calle Olivo 2',
  nucleo: 'Albolote',
  fecha_ultima_revision: '2026-07-01',
  foto_path: 'fotos/actual-conexion.jpg',
  foto_sitio_path: 'fotos/actual-sitio.jpg',
};

function propuesta(operacion: Operacion, extra: Partial<PropuestaPanel> = {}): PropuestaPanel {
  return {
    id: 'p1',
    operacion,
    estado: 'pendiente',
    creada_en: '2026-09-20T10:00:00Z',
    autor_nombre: 'Prueba',
    autor_apellido: 'Uno',
    punto_id: operacion === 'alta' ? null : 'x1',
    codigo: operacion === 'alta' ? null : 'HID-9001',
    datos: {},
    foto_path: null,
    direccion_sugerida: null,
    direccion_actual: 'Calle Olivo 2',
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
    punto_actualizado_en: null,
    punto: operacion === 'alta' ? null : ACTUAL,
    punto_lat: operacion === 'alta' ? null : 37.27,
    punto_lng: operacion === 'alta' ? null : -3.62,
    ...extra,
  };
}

const claves = (p: PropuestaPanel, punto?: Punto) => fichaCompleta(p, punto).campos.map((c) => c.clave);
const cambian = (p: PropuestaPanel) =>
  fichaCompleta(p)
    .campos.filter((c) => c.cambia)
    .map((c) => c.clave);

describe('fichaCompleta (RV-110)', () => {
  it('corregir datos: todos los campos y solo el diámetro cambia, el primero', () => {
    const p = propuesta('datos', { datos: { diametro_mm: 70 }, antes: { diametro_mm: 100 } });
    const f = fichaCompleta(p);
    expect(cambian(p)).toEqual(['diametro_mm']);
    expect(f.cambios).toBe(1);
    expect(f.campos[0]).toMatchObject({
      clave: 'diametro_mm',
      antes: T.formato.mm(100),
      valor: T.formato.mm(70),
    });
    // El resto, en el orden de la lista y sin marcar.
    expect(claves(p)).toEqual([
      'diametro_mm',
      'codigo',
      'tipo',
      'caudal',
      'descripcion',
      'direccion',
      'nucleo',
      'wgs84',
      'utm',
      'revision',
      'origen',
      'autor',
    ]);
    const valor = (k: string) => f.campos.find((c) => c.clave === k)?.valor;
    expect(valor('codigo')).toBe('HID-9001');
    expect(valor('caudal')).toBe('Bueno');
    expect(valor('wgs84')).toBe('37.270000, -3.620000');
    expect(valor('utm')).toMatch(/^30S \d{6} \d{7}$/);
    expect(valor('autor')).toBe('Prueba Uno');
  });

  it('una boca lleva el racor; un hidrante no', () => {
    const boca = propuesta('datos', {
      codigo: 'BOC-9001',
      datos: { racor: 'barcelona' },
      antes: { racor: 'granada' },
      punto: { ...ACTUAL, codigo: 'BOC-9001', tipo: 'boca_riego', diametro_mm: 45, racor: 'granada' },
    });
    expect(cambian(boca)).toEqual(['racor']);
    expect(fichaCompleta(boca).campos[0]).toMatchObject({ antes: 'Granada', valor: 'Barcelona' });
    expect(claves(propuesta('revision'))).not.toContain('racor');
  });

  it('el fallo sale solo si el punto queda en «no funciona»', () => {
    const p = propuesta('estado', {
      datos: { caudal: 'no_funciona', descripcion_fallo: 'No abre' },
      antes: { caudal: 'bueno' },
    });
    expect(cambian(p)).toEqual(['caudal', 'descripcion_fallo']);
    expect(claves(propuesta('revision'))).not.toContain('descripcion_fallo');
  });

  it('en un alta se marcan los datos del voluntario; código y revisión se fijan al aprobar', () => {
    const p = propuesta('alta', {
      datos: { tipo: 'hidrante', diametro_mm: 100, caudal: 'bueno', descripcion: 'Junto a la gasolinera' },
      lat: 37.27011,
      lng: -3.6221,
      direccion_sugerida: 'Ctra. de Sierra Nevada',
      origen_ubicacion: 'gps',
      precision_gps_m: 4,
    });
    const f = fichaCompleta(p);
    expect(f.alta).toBe(true);
    expect(f.cambios).toBe(4);
    expect(cambian(p)).toEqual(['tipo', 'diametro_mm', 'caudal', 'descripcion']);
    const campo = (k: string) => f.campos.find((c) => c.clave === k)!;
    expect(campo('codigo')).toMatchObject({ valor: T.panelCola.seAsignaAlAprobar, suave: true, cambia: false });
    expect(campo('revision')).toMatchObject({ valor: T.panelCola.seFijaAlAprobar, suave: true });
    expect(campo('direccion')).toMatchObject({ valor: 'Ctra. de Sierra Nevada', cambia: false });
    expect(campo('origen').valor).toBe(T.panelCola.origenGps(4));
    expect(campo('wgs84').cambia).toBe(false);
  });

  it('corregir ubicación: cambian las dos coordenadas y la dirección, de la posición de ahora a la nueva', () => {
    const p = propuesta('ubicacion', {
      lat: 37.27037,
      lng: -3.62042,
      direccion_sugerida: 'Calle Olivo 8',
      origen_ubicacion: 'manual',
    });
    const f = fichaCompleta(p);
    expect(cambian(p)).toEqual(['direccion', 'wgs84', 'utm']);
    expect(f.campos.find((c) => c.clave === 'wgs84')).toMatchObject({
      antes: '37.270000, -3.620000',
      valor: '37.270370, -3.620420',
    });
    expect(f.campos.find((c) => c.clave === 'direccion')).toMatchObject({ antes: 'Calle Olivo 2' });
  });

  it('revisión: cambia la fecha; retirada: la situación, con el motivo', () => {
    const r = fichaCompleta(propuesta('revision', { datos: { nota: 'Todo bien' } }));
    expect(r.campos[0]).toMatchObject({ clave: 'revision', cambia: true, antes: '1 jul 2026' });
    expect(r.campos[1]).toMatchObject({ clave: 'nota', valor: '"Todo bien"' });
    const ret = fichaCompleta(propuesta('retirada', { datos: { motivo_rapido: 'obras' } }));
    expect(ret.campos[0]).toMatchObject({ clave: 'situacion', antes: T.panelCola.activo, valor: T.panelCola.retirado });
    expect(ret.campos[1]).toMatchObject({ clave: 'motivo', valor: T.formulario.obras });
  });

  it('sin la columna punto (panel antes de 0036), toma los datos del inventario cargado', () => {
    const inventario = {
      id: 'x1',
      ...ACTUAL,
      diametro_mm: 100,
      fecha_ultima_revision: '2026-07-01',
      actualizado_en: '2026-07-01',
      municipio: 'Albolote',
      lat: 37.271,
      lng: -3.621,
      radio_px: 9,
      revision_caducada: false,
    } as Punto;
    const p = propuesta('datos', {
      datos: { diametro_mm: 70 },
      punto: undefined,
      punto_lat: undefined,
      punto_lng: undefined,
    });
    const f = fichaCompleta(p, inventario);
    expect(f.campos.find((c) => c.clave === 'wgs84')?.valor).toBe('37.271000, -3.621000');
    expect(f.campos.find((c) => c.clave === 'descripcion')?.valor).toBe('[PRUEBA] Esquina con la plaza');
    // Y sin nada de dónde sacarlo, se dice con palabras.
    const nada = fichaCompleta(propuesta('datos', { punto: undefined, punto_lat: undefined, punto_lng: undefined }));
    expect(nada.campos.find((c) => c.clave === 'wgs84')?.valor).toBe(T.panelCola.sinDato);
  });
});

describe('planMapa (RV-110): hay mapa en las seis operaciones', () => {
  it.each(['alta', 'revision', 'estado', 'datos', 'ubicacion', 'retirada'] as Operacion[])('%s', (op) => {
    const p = propuesta(op, op === 'alta' || op === 'ubicacion' ? { lat: 37.2704, lng: -3.6204 } : {});
    expect(planMapa(p).centro).not.toBeNull();
  });

  it('una ubicación se abre en satélite con las dos posiciones y la flecha', () => {
    const plan = planMapa(propuesta('ubicacion', { lat: 37.2704, lng: -3.6204 }));
    expect(plan.capa).toBe('satelite');
    expect(plan.actual).toEqual({ lat: 37.27, lng: -3.62 });
    expect(plan.propuesta).toEqual({ lat: 37.2704, lng: -3.6204 });
    expect(plan.flecha!.metros).toBeGreaterThan(40);
    expect(plan.circulo).toBe(false);
  });

  it('un alta se abre en el mapa con el pin propuesto y el círculo de duplicado', () => {
    const plan = planMapa(propuesta('alta', { lat: 37.2704, lng: -3.6204 }));
    expect(plan).toMatchObject({ capa: 'base', circulo: true, actual: null, flecha: null });
    expect(plan.propuesta).toEqual({ lat: 37.2704, lng: -3.6204 });
  });

  it('las demás, en el mapa, con el punto en su sitio; sin posición, sin centro', () => {
    expect(planMapa(propuesta('datos'))).toMatchObject({ capa: 'base', actual: { lat: 37.27, lng: -3.62 } });
    expect(planMapa(propuesta('datos', { punto_lat: null, punto_lng: null })).centro).toBeNull();
  });
});

describe('fotosDe (RV-110)', () => {
  const nuevas = { foto_path: 'fotos/n-conexion.jpg', foto_sitio_path: 'fotos/n-sitio.jpg' };

  it('alta: conexión y sitio', () => {
    const f = fotosDe(propuesta('alta', nuevas));
    expect(f.nuevas).toBe(true);
    expect(f.fotos.map((x) => x.etiqueta)).toEqual([T.formulario.conexion, T.formulario.sitio]);
  });

  it('ubicación: la actual del punto delante de las dos nuevas', () => {
    const f = fotosDe(propuesta('ubicacion', nuevas));
    expect(f.fotos.map((x) => [x.etiqueta, x.nueva])).toEqual([
      [T.panelCola.fotoActualPunto, false],
      [T.panelCola.fotoNueva(T.panelCola.conexion), true],
      [T.panelCola.fotoNueva(T.panelCola.sitio), true],
    ]);
    expect(f.fotos[0]!.path).toBe('fotos/actual-conexion.jpg');
  });

  it('sin fotos nuevas: las actuales del punto, y lo dice', () => {
    const f = fotosDe(propuesta('datos'));
    expect(f.nuevas).toBe(false);
    expect(f.fotos.map((x) => x.etiqueta)).toEqual([
      T.panelCola.fotoActual(T.panelCola.conexion),
      T.panelCola.fotoActual(T.panelCola.sitio),
    ]);
  });

  it('sin la columna punto, las actuales salen de foto_path_actual', () => {
    const f = fotosDe(
      propuesta('estado', { punto: undefined, foto_path_actual: 'fotos/v.jpg', foto_path: 'fotos/n.jpg' }),
    );
    expect(f.fotos.map((x) => x.path)).toEqual(['fotos/v.jpg', 'fotos/n.jpg']);
  });
});

describe('historial (v_historial_revision, 0036)', () => {
  const fila = {
    id: 'h1',
    operacion: 'ubicacion' as const,
    estado: 'aprobada' as const,
    creada_en: '2026-09-20T10:00:00Z',
    autor_nombre: 'Prueba',
    autor_apellido: 'Uno',
    punto_id: 'x1',
    codigo: 'HID-9001',
    datos: null,
    foto_path: null,
    foto_sitio_path: null,
    direccion_sugerida: 'Calle Olivo 8',
    direccion_actual: 'Calle Olivo 8',
    lat: 37.2704,
    lng: -3.6204,
    origen_ubicacion: 'gps' as const,
    precision_gps_m: 4,
    nucleo: 'Albolote',
    motivo_rechazo: null,
    correcciones: null,
    revisada_por: 'jefe@example.org',
    revisada_en: '2026-09-21T10:00:00Z',
    punto: { ...ACTUAL, direccion: 'Calle Olivo 8' },
    punto_lat: 37.2704,
    punto_lng: -3.6204,
  };

  it('trae el pin, el punto de hoy y su posición; el mapa sale', () => {
    const p = desdeHistorial(fila);
    expect(p).toMatchObject({ lat: 37.2704, punto_lat: 37.2704, codigo: 'HID-9001', datos: {} });
    expect(planMapa(p).centro).toEqual({ lat: 37.2704, lng: -3.6204 });
  });

  it('decidida, el antes no se toma del punto de hoy, que ya lleva el cambio', () => {
    const p = desdeHistorial({ ...fila, operacion: 'revision', lat: null, lng: null });
    expect(fichaCompleta(p).campos[0]).toMatchObject({ clave: 'revision', cambia: true, antes: undefined });
  });

  it('un alta aprobada no enlaza al punto: el mapa, en el pin', () => {
    const p = desdeHistorial({
      ...fila,
      operacion: 'alta',
      punto_id: null,
      codigo: null,
      punto: null,
      punto_lat: null,
      punto_lng: null,
    });
    expect(planMapa(p).centro).toEqual({ lat: 37.2704, lng: -3.6204 });
  });
});

describe('situación del punto (0036)', () => {
  it('un punto en la papelera lo dice arriba', () => {
    const f = fichaCompleta(
      propuesta('datos', { punto: { ...ACTUAL, situacion: 'borrado', borrado_en: '2026-09-22' } }),
    );
    expect(f.campos[0]).toMatchObject({ clave: 'situacion', valor: T.panelCola.papelera });
  });
});
