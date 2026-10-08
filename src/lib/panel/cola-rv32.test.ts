// docs/32 RV-250 a RV-255: lo que se calcula sin red en la Cola y el detalle de la propuesta.

import { describe, expect, it } from 'vitest';
import {
  type PropuestaPanel,
  type PuntoCola,
  MAXIMO_OPCION,
  cambiosDecision,
  correccionesDe,
  diferenciasFusion,
  ponerAlDia,
  recortarOpcion,
  valoresPropuestos,
} from './cola';
import { alCambiarEntrada } from '@/hooks/carga';
import type { Punto } from '../puntos';

function propuesta(extra: Partial<PropuestaPanel> = {}): PropuestaPanel {
  return {
    id: 'p1',
    operacion: 'estado',
    estado: 'pendiente',
    creada_en: '2026-09-20T10:00:00Z',
    autor_nombre: 'Prueba',
    autor_apellido: 'Uno',
    punto_id: 'x1',
    codigo: 'HID-0147',
    datos: { caudal: 'regular' },
    foto_path: null,
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
    punto_actualizado_en: null,
    ...extra,
  };
}

const INVENTARIO: Punto = {
  id: 'x1',
  codigo: 'HID-0147',
  tipo: 'hidrante',
  diametro_mm: 100,
  caudal: 'bueno',
  racor: null,
  descripcion_fallo: null,
  descripcion: 'Junto al bar',
  direccion: 'C/ Real 14',
  nucleo: 'Albolote',
  municipio: 'Albolote',
  fecha_ultima_revision: '2026-03-01',
  foto_path: null,
  foto_sitio_path: null,
  lat: 37.23,
  lng: -3.65,
} as Punto;

const FILA: PuntoCola = {
  codigo: 'HID-0147',
  tipo: 'hidrante',
  diametro_mm: 70,
  caudal: 'malo',
  racor: null,
  descripcion: 'Frente a la farmacia',
  descripcion_fallo: null,
  direccion: 'C/ Real 14',
  nucleo: 'Albolote',
  fecha_ultima_revision: '2026-09-01',
  foto_path: null,
  foto_sitio_path: null,
};

describe('RV-250: la Cola al cambiar de filtro', () => {
  const conFilas = { estado: 'ok' as const, datos: [{ id: 'pendiente-1' }] };

  it('con vaciarAlCambiar, la lista se vacía y queda "cargando"', () => {
    expect(alCambiarEntrada(conFilas, true)).toEqual({ estado: 'cargando', datos: null });
  });

  it('sin la opción, se conserva lo que había (FR-168), como hasta ahora', () => {
    expect(alCambiarEntrada(conFilas, false)).toEqual({ estado: 'cargando', datos: conFilas.datos });
  });
});

describe('RV-251: "Aprobar con correcciones" solo manda lo tocado', () => {
  it('la base es la fila `punto` que trae la cola (0036), no el inventario', () => {
    const p = propuesta({ datos: { caudal: 'regular' }, punto: FILA });
    expect(valoresPropuestos(p, INVENTARIO)).toMatchObject({ diametro_mm: 70, descripcion: 'Frente a la farmacia' });
  });

  it('sin `punto`, la base sigue siendo el inventario', () => {
    expect(valoresPropuestos(propuesta(), INVENTARIO)).toMatchObject({ diametro_mm: 100, descripcion: 'Junto al bar' });
  });

  it('tras un DESACTUALIZADA, lo no tocado se pone al día y no va como corrección', () => {
    const visto = valoresPropuestos(propuesta(), INVENTARIO);
    // Jefatura corrige solo la descripción.
    const escrito = { ...visto, descripcion: 'Junto al bar, tapa nueva' };
    // Mientras tanto, otra persona fija el diámetro en 70: la cola se recarga con el punto de hoy.
    const nuevo = valoresPropuestos(propuesta({ punto: { ...FILA, descripcion: 'Junto al bar' } }), INVENTARIO);
    const alDia = ponerAlDia(visto, escrito, nuevo);
    expect(alDia).toMatchObject({ diametro_mm: 70, descripcion: 'Junto al bar, tapa nueva' });
    // Lo que se manda: solo la descripción. Antes de RV-251 iba también diametro_mm: 100 (el viejo).
    expect(correccionesDe(nuevo, alDia)).toEqual({ descripcion: 'Junto al bar, tapa nueva' });
  });

  it('lo que jefatura ha devuelto a lo que vio cuenta como no tocado', () => {
    const visto = valoresPropuestos(propuesta(), INVENTARIO);
    const nuevo = { ...visto, caudal: 'malo' as const };
    expect(ponerAlDia(visto, { ...visto }, nuevo)).toEqual(nuevo);
  });

  it('un cambio de tipo (alta) se queda entero', () => {
    const visto = valoresPropuestos(
      propuesta({ operacion: 'alta', datos: { tipo: 'hidrante', diametro_mm: 100, caudal: 'bueno' } }),
    );
    const escrito = { ...visto, tipo: 'boca_riego' as const, diametro_mm: 45, racor: 'granada' as const };
    expect(ponerAlDia(visto, escrito, { ...visto, caudal: 'regular' })).toEqual(escrito);
  });
});

describe('RV-253: fusionar una boca de otra medida', () => {
  const BOCA: Punto = { ...INVENTARIO, codigo: 'BOC-0042', tipo: 'boca_riego', diametro_mm: 45, racor: 'granada' };

  it('el diametro_otro de una boca sale entre lo que difiere', () => {
    const p = propuesta({
      operacion: 'alta',
      datos: { tipo: 'boca_riego', diametro_otro: 38, caudal: 'bueno', racor: 'granada' },
    });
    expect(diferenciasFusion(p, BOCA)).toContainEqual({ campo: 'diametro_mm', propuesta: '38 mm', existente: '45 mm' });
  });

  it('el de un hidrante de otra medida no: no hay diámetro que copiar', () => {
    const p = propuesta({ operacion: 'alta', datos: { tipo: 'hidrante', diametro_otro: 80, caudal: 'bueno' } });
    expect(diferenciasFusion(p, INVENTARIO).map((d) => d.campo)).not.toContain('diametro_mm');
  });
});

describe('RV-254: las opciones de fusionar caben a 412 px', () => {
  it('un texto largo se recorta a 60 caracteres con "…"', () => {
    const largo = 'x'.repeat(500);
    const corto = recortarOpcion(largo);
    expect(corto).toHaveLength(MAXIMO_OPCION);
    expect(corto.endsWith('…')).toBe(true);
  });

  it('uno corto se queda igual', () => {
    expect(recortarOpcion('Junto al bar')).toBe('Junto al bar');
  });
});

describe('RV-255: historial de la propuesta con valores en palabras', () => {
  it('"Dirección → —", el enganche y el diámetro como en pantalla', () => {
    expect(cambiosDecision({ direccion: null, racor: 'barcelona', diametro_mm: 70 })).toBe(
      'Dirección → —, Tipo de enganche → Barcelona, Diámetro → 70 mm',
    );
  });

  it('el estado en palabras, no la clave', () => {
    expect(cambiosDecision({ caudal: 'no_funciona' })).toBe('Estado → No funciona');
  });

  it('los ids internos y la fusión no salen como cambios', () => {
    expect(cambiosDecision({ punto_id: '5eed', fusionada_con: 'HID-0147' })).toBeNull();
    expect(cambiosDecision(null)).toBeNull();
  });
});
