import { describe, expect, it, vi } from 'vitest';
import {
  CUOTA_FOTOS_BYTES,
  PARAMETROS_POR_DEFECTO,
  avisoAlmacenamiento,
  cambiosParametros,
  faltaEnParametros,
  generarCodigo,
} from './ajustes';
import { filtrarActividad, porcentaje } from './voluntarios';

describe('código de acceso (FR-140)', () => {
  it('son seis cifras y salen del generador criptográfico', () => {
    const espia = vi.spyOn(crypto, 'getRandomValues');
    for (let i = 0; i < 50; i++) expect(generarCodigo()).toMatch(/^\d{6}$/);
    expect(espia).toHaveBeenCalled();
    espia.mockRestore();
  });
});

describe('parámetros (FR-142)', () => {
  it('solo viaja lo que cambia', () => {
    const antes = PARAMETROS_POR_DEFECTO;
    expect(cambiosParametros(antes, antes)).toEqual({});
    expect(cambiosParametros(antes, { ...antes, meses_revision: 18 })).toEqual({ meses_revision: 18 });
    expect(cambiosParametros(antes, { ...antes, escala_radios: [12, 9, 7, 5.5, 5] })).toEqual({
      escala_radios: [12, 9, 7, 5.5, 5],
    });
  });

  it('respeta los rangos que valida fn_guardar_config', () => {
    const v = PARAMETROS_POR_DEFECTO;
    expect(faltaEnParametros(v)).toBeNull();
    expect(faltaEnParametros({ ...v, meses_revision: 0 })).toBe('meses_revision');
    expect(faltaEnParametros({ ...v, meses_revision: 12.5 })).toBe('meses_revision');
    expect(faltaEnParametros({ ...v, dias_papelera: 400 })).toBe('dias_papelera');
    expect(faltaEnParametros({ ...v, buffer_zona_m: 0 })).toBeNull();
    expect(faltaEnParametros({ ...v, escala_radios: [11, 9, 7] })).toBe('escala_radios');
    expect(faltaEnParametros({ ...v, escala_radios: [40, 9, 7, 5.5, 5] })).toBe('escala_radios');
  });
});

describe('voluntarios (FR-130)', () => {
  const filas = [
    {
      autor: 'Luis Martín',
      dispositivo_id: 'd1',
      propuestas: 4,
      aprobadas: 3,
      rechazadas: 1,
      tasa: 0.75,
      ultima: '2026-09-19T08:00:00Z',
    },
    {
      autor: 'Ángela Ruiz',
      dispositivo_id: 'd2',
      propuestas: 1,
      aprobadas: 0,
      rechazadas: 0,
      tasa: null,
      ultima: '2026-09-18T08:00:00Z',
    },
  ];

  it('la tasa se enseña en porcentaje entero, y sin resolver es null', () => {
    expect(porcentaje(0.75)).toBe(75);
    expect(porcentaje(0.666)).toBe(67);
    expect(porcentaje(null)).toBeNull();
  });

  it('la búsqueda global también filtra la actividad, sin acentos', () => {
    expect(filtrarActividad(filas, 'angela')).toHaveLength(1);
    expect(filtrarActividad(filas, '')).toHaveLength(2);
  });
});

describe('aviso de almacenamiento (TR-53)', () => {
  it('calla mientras quede sitio: el 89 % todavía no es noticia', () => {
    expect(avisoAlmacenamiento(null)).toBe(null);
    expect(avisoAlmacenamiento(0)).toBe(null);
    expect(avisoAlmacenamiento(Math.round(CUOTA_FOTOS_BYTES * 0.5))).toBe(null);
    expect(avisoAlmacenamiento(Math.round(CUOTA_FOTOS_BYTES * 0.89))).toBe(null);
  });

  it('desde el 90 % devuelve el porcentaje, que es lo que se enseña', () => {
    expect(avisoAlmacenamiento(Math.round(CUOTA_FOTOS_BYTES * 0.9))).toBe(90);
    expect(avisoAlmacenamiento(Math.round(CUOTA_FOTOS_BYTES * 0.955))).toBe(96);
  });

  it('lleno o pasado de la cota, 100 %: nunca un número imposible', () => {
    expect(avisoAlmacenamiento(CUOTA_FOTOS_BYTES)).toBe(100);
    expect(avisoAlmacenamiento(CUOTA_FOTOS_BYTES * 3)).toBe(100);
  });
});
