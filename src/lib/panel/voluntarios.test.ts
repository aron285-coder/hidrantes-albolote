// Actividad de los voluntarios (FR-130): números para ayudar, nunca un ranking.

import { describe, expect, it } from 'vitest';
import { type Actividad, MESES, TASA_BAJA, filtrarActividad, porcentaje } from './voluntarios';

const fila = (autor: string, tasa: number | null = 0.8): Actividad => ({
  autor,
  dispositivo_id: autor.toLowerCase(),
  propuestas: 10,
  aprobadas: 8,
  rechazadas: 2,
  tasa,
  ultima: '2026-09-01T10:00:00Z',
});

describe('voluntarios (FR-130)', () => {
  it('los periodos son los de 01: 3 y 12 meses', () => {
    expect(MESES).toEqual([3, 12]);
  });

  it('la tasa se enseña como porcentaje entero, y sin resolver es null', () => {
    expect(porcentaje(0.8)).toBe(80);
    expect(porcentaje(0.666)).toBe(67);
    expect(porcentaje(1)).toBe(100);
    expect(porcentaje(0)).toBe(0);
    expect(porcentaje(null)).toBeNull();
  });

  it('el umbral de "conviene explicar mejor" es 70 %', () => {
    expect(TASA_BAJA).toBe(70);
    expect(porcentaje(0.69)! < TASA_BAJA).toBe(true);
    expect(porcentaje(0.7)! < TASA_BAJA).toBe(false);
  });

  it('la búsqueda ignora acentos y mayúsculas, como en la cola', () => {
    const filas = [fila('Martínez'), fila('Ruiz'), fila('MUÑOZ')];
    expect(filtrarActividad(filas, 'martinez').map((f) => f.autor)).toEqual(['Martínez']);
    expect(filtrarActividad(filas, 'MUNOZ').map((f) => f.autor)).toEqual(['MUÑOZ']);
    expect(filtrarActividad(filas, '  ').length).toBe(3);
    expect(filtrarActividad(filas, 'nadie')).toEqual([]);
  });
});
