// docs/24 RV-101 (DEC-144, DEC-148): bocas de riego de 45, 70 u otra medida (entero de 20 a 150),
// en el alta y en corregir datos; el móvil calcula el tamaño como fn_radio_px de 0032; el panel no
// bloquea la aprobación de una boca de otra medida.

import { describe, expect, it } from 'vitest';
import type { Punto } from '../tipos/punto';
import { CONFIG_POR_DEFECTO, radioPx } from './derivar';
import { cambiosDatos, datosDe, diametroPermitido, medidaBocaValida, queFalta, type Formulario } from './propuestas';
import {
  bloqueoPorMedida,
  correccionesDe,
  faltaEnCorrecciones,
  fichaCompleta,
  tieneAviso,
  valoresPropuestos,
} from './panel/cola';
import { cambiosDe, faltaEnEdicion } from './panel/inventario';
import type { PropuestaPanel } from './panel/cola';
import { T } from './textos';

const a = T.avisosFormulario;
const PIN = { lat: 37.2308, lng: -3.6569 };
const base: Formulario = { operacion: 'alta', pin: PIN, tipo: 'boca_riego' };

const BOCA: Punto = {
  id: 'b1',
  codigo: 'BOC-0088',
  tipo: 'boca_riego',
  diametro_mm: 45,
  caudal: 'bueno',
  racor: 'granada',
  descripcion_fallo: null,
  descripcion: null,
  direccion: null,
  foto_path: null,
  municipio: 'albolote',
  nucleo: 'Albolote',
  fecha_ultima_revision: '2026-01-01',
  actualizado_en: '2026-01-01T00:00:00Z',
  lat: 37.23,
  lng: -3.65,
  radio_px: 7,
  revision_caducada: false,
};

describe('alta de una boca de riego (RV-101)', () => {
  it('hay que elegir el diámetro, como en un hidrante', () => {
    expect(queFalta(base, null)).toBe(a.eligeDiametro);
    expect(queFalta({ ...base, diametro: 45 }, null)).toBe(a.eligeRacor);
  });

  it('70 mm va como diametro_mm', () => {
    expect(datosDe({ ...base, diametro: 70, racor: 'barcelona', caudal: 'bueno' }, null)).toEqual({
      tipo: 'boca_riego',
      diametro_mm: 70,
      racor: 'barcelona',
      caudal: 'bueno',
    });
  });

  it('otra medida va como diametro_otro entero, sin diametro_mm', () => {
    expect(datosDe({ ...base, diametro: 'otro', diametroOtro: '32', racor: 'otro', caudal: 'bueno' }, null)).toEqual({
      tipo: 'boca_riego',
      diametro_otro: 32,
      racor: 'otro',
      caudal: 'bueno',
    });
  });

  it('«Indica la medida» si el campo está vacío, tiene decimales o se sale de 20 a 150', () => {
    for (const m of [undefined, '', '  ', '32,5', '19', '151', '200', 'abc']) {
      expect(queFalta({ ...base, diametro: 'otro', diametroOtro: m }, null)).toBe(a.indicaMedida);
    }
    expect(queFalta({ ...base, diametro: 'otro', diametroOtro: '150' }, null)).toBe(a.eligeRacor);
    expect(medidaBocaValida('20')).toBe(true);
    expect(medidaBocaValida('32.5')).toBe(false);
  });
});

describe('corregir datos de una boca (RV-101)', () => {
  it('ya no fuerza 45: una boca de 70 sin tocar no propone nada', () => {
    expect(cambiosDatos({ operacion: 'datos' }, { ...BOCA, diametro_mm: 70 })).toEqual({});
    expect(queFalta({ operacion: 'datos' }, { ...BOCA, diametro_mm: 70 })).toBe(a.sinCambios);
  });

  it('cambia a 70, o a otra medida', () => {
    expect(cambiosDatos({ operacion: 'datos', diametro: 70 }, BOCA)).toEqual({ diametro_mm: 70 });
    expect(cambiosDatos({ operacion: 'datos', diametro: 'otro', diametroOtro: '32' }, BOCA)).toEqual({
      diametro_otro: 32,
    });
    expect(queFalta({ operacion: 'datos', diametro: 'otro', diametroOtro: '' }, BOCA)).toBe(a.indicaMedida);
  });

  it('la misma otra medida que ya tiene no es un cambio', () => {
    expect(
      cambiosDatos({ operacion: 'datos', diametro: 'otro', diametroOtro: '32' }, { ...BOCA, diametro_mm: 32 }),
    ).toEqual({});
  });
});

describe('tamaño en el mapa: réplica de fn_radio_px de 0032 (RV-101)', () => {
  const e = CONFIG_POR_DEFECTO.escala_radios;
  it('≤ 45 → 1, ≤ 70 → 2, > 70 → 3', () => {
    expect(radioPx(32, 'bueno', e)).toBe(radioPx(45, 'bueno', e));
    expect(radioPx(50, 'bueno', e)).toBe(radioPx(70, 'bueno', e));
    expect(radioPx(80, 'bueno', e)).toBe(radioPx(100, 'bueno', e));
    expect(radioPx(32, 'bueno', e)).toBe(e[2]);
    expect(radioPx(90, 'regular', e)).toBe(e[1]);
  });
});

describe('panel: una boca de otra medida se aprueba tal cual (RV-101)', () => {
  const propuesta = (datos: Record<string, unknown>, operacion = 'alta'): PropuestaPanel =>
    ({ id: 'x', operacion, otra_medida: true, datos, antes: null }) as unknown as PropuestaPanel;

  it('no bloquea «Aprobar» en una boca; en un hidrante sí', () => {
    expect(bloqueoPorMedida(propuesta({ tipo: 'boca_riego', diametro_otro: 32 }))).toBeNull();
    expect(bloqueoPorMedida(propuesta({ tipo: 'hidrante', diametro_otro: 80 }))).toBe(T.panelCola.fijaDiametro);
    expect(bloqueoPorMedida(propuesta({ diametro_otro: 32 }, 'datos'), BOCA)).toBeNull();
  });

  it('el diff y los valores enseñan el número tal cual', () => {
    const p = propuesta({ tipo: 'boca_riego', diametro_otro: 32, racor: 'otro', caudal: 'bueno' });
    expect(valoresPropuestos(p).diametro_mm).toBe(32);
    expect(fichaCompleta(p).campos.find((f) => f.clave === 'diametro_mm')?.valor).toBe(T.formato.mm(32));
    const setenta = propuesta({ tipo: 'boca_riego', diametro_mm: 70, racor: 'otro', caudal: 'bueno' });
    expect(valoresPropuestos(setenta).diametro_mm).toBe(70);
  });

  it('jefatura corrige el diámetro de una boca con un número de 20 a 150', () => {
    const v = valoresPropuestos(propuesta({ tipo: 'boca_riego', diametro_mm: 45, racor: 'granada', caudal: 'bueno' }));
    expect(correccionesDe(v, { ...v, diametro_mm: 70 })).toEqual({ diametro_mm: 70 });
    expect(faltaEnCorrecciones({ ...v, diametro_mm: 32 })).toBeNull();
    expect(faltaEnCorrecciones({ ...v, diametro_mm: 200 })).toBe(a.indicaMedida);
    expect(faltaEnCorrecciones({ ...v, diametro_mm: null })).toBe(a.indicaMedida);
  });
});

describe('cambiar de tipo en el alta no deja un diámetro que el tipo nuevo no admite', () => {
  it('45 en un hidrante o 100 en una boca piden elegir otra vez', () => {
    expect(queFalta({ operacion: 'alta', pin: PIN, tipo: 'hidrante', diametro: 45 }, null)).toBe(a.eligeDiametro);
    expect(queFalta({ operacion: 'alta', pin: PIN, tipo: 'boca_riego', diametro: 100 }, null)).toBe(a.eligeDiametro);
    expect(diametroPermitido('boca_riego', 70)).toBe(true);
    expect(diametroPermitido('hidrante', 'otro')).toBe(true);
  });
});

describe('revisión del PR: corregir datos y editar en el inventario (RV-101)', () => {
  it('volver a «Otra medida» en una boca de 32 sin tocar el número no pide escribirla', () => {
    const b32 = { ...BOCA, diametro_mm: 32 };
    expect(queFalta({ operacion: 'datos', diametro: 'otro' }, b32)).toBe(a.sinCambios);
    expect(cambiosDatos({ operacion: 'datos', diametro: 'otro', racor: 'barcelona' }, b32)).toEqual({
      racor: 'barcelona',
    });
  });

  it('el inventario edita el diámetro de una boca con un número de 20 a 150', () => {
    const v = { diametro_mm: 45, racor: BOCA.racor, caudal: BOCA.caudal };
    expect(cambiosDe(BOCA, { ...v, diametro_mm: 70 })).toEqual({ diametro_mm: 70 });
    expect(cambiosDe(BOCA, v)).toEqual({});
    expect(faltaEnEdicion(BOCA, { ...v, diametro_mm: 200 })).toBe(a.indicaMedida);
    expect(faltaEnEdicion(BOCA, { ...v, diametro_mm: 32 })).toBeNull();
    expect(faltaEnEdicion(BOCA, v)).toBe(a.sinCambios);
  });

  it('una boca de otra medida no lleva ⚠ en la lista de la cola', () => {
    const p = {
      id: 'x',
      operacion: 'alta',
      otra_medida: true,
      datos: { tipo: 'boca_riego', diametro_otro: 32 },
      antes: null,
    };
    expect(tieneAviso(p as unknown as PropuestaPanel)).toBe(false);
    expect(tieneAviso({ ...p, datos: { tipo: 'hidrante', diametro_otro: 80 } } as unknown as PropuestaPanel)).toBe(
      true,
    );
  });
});

describe('revisión del PR: corregir datos de una boca en el panel (RV-101)', () => {
  const datos = (d: Record<string, unknown>) =>
    ({
      id: 'x',
      operacion: 'datos',
      codigo: 'BOC-0088',
      otra_medida: true,
      datos: d,
      antes: { diametro_mm: 45 },
    }) as unknown as PropuestaPanel;

  it('el diff enseña la otra medida frente a la que tenía', () => {
    const fila = fichaCompleta(datos({ diametro_otro: 32 })).campos.find((x) => x.clave === 'diametro_mm');
    expect(fila).toMatchObject({
      etiqueta: T.panelCola.campoDiametro,
      antes: T.formato.mm(45),
      valor: T.formato.mm(32),
      cambia: true,
    });
  });

  it('sin el punto a mano, el tipo sale del código: ni ⚠ ni «hay que fijar 70 o 100»', () => {
    const p = datos({ diametro_otro: 32 });
    expect(tieneAviso(p)).toBe(false);
    expect(bloqueoPorMedida(p)).toBeNull();
  });

  it('jefatura cambia un alta de boca de 70 a hidrante: el diámetro va en las correcciones', () => {
    const p = {
      id: 'x',
      operacion: 'alta',
      otra_medida: false,
      datos: { tipo: 'boca_riego', diametro_mm: 70, racor: 'granada', caudal: 'bueno' },
      antes: null,
    } as unknown as PropuestaPanel;
    const v = valoresPropuestos(p);
    expect(correccionesDe(v, { ...v, tipo: 'hidrante', racor: null })).toEqual({ tipo: 'hidrante', diametro_mm: 70 });
  });
});
