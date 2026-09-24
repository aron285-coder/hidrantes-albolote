// Medir distancia en tramos de manguera (FR-76; docs/18 GM-06).

import { describe, expect, it } from 'vitest';
import { longitudLinea } from './geometria';
import { anadir, borrar, deshacer, desplazamientoEtiqueta, imantar, puedeDeshacer, resumen } from './medicion';

const O = { lat: 37.23, lng: -3.656 };
const alNorte = (m: number) => ({ lat: O.lat + m / 111_195, lng: O.lng });

describe('medición', () => {
  it('la suma de los tramos coincide con longitudLinea', () => {
    const v = [O, alNorte(60), alNorte(186)];
    const r = resumen(v, 20);
    expect(r.metros).toBeCloseTo(longitudLinea(v), 6);
    expect(r.metros).toBeCloseTo(186, 0);
    expect(r.tramos).toBe(10);
  });

  it('los tramos usan la longitud de la config', () => {
    expect(resumen([O, alNorte(100)], 20).tramos).toBe(5);
    expect(resumen([O, alNorte(100)], 25).tramos).toBe(4);
    expect(resumen([O], 20)).toEqual({ metros: 0, tramos: 0, etiquetas: [] });
  });

  it('etiqueta solo los tramos de más de 30 m', () => {
    const r = resumen([O, alNorte(20), alNorte(100)], 20);
    expect(r.etiquetas).toHaveLength(1);
    expect(r.etiquetas[0]!.metros).toBeCloseTo(80, 0);
  });

  it('el imán elige el marcador más cercano dentro del radio y ninguno fuera', () => {
    const marcadores = [
      { id: 'a', x: 130, y: 100 },
      { id: 'b', x: 110, y: 100 },
      { id: 'lejos', x: 200, y: 200 },
    ];
    expect(imantar({ x: 100, y: 100 }, marcadores)?.id).toBe('b');
    expect(imantar({ x: 300, y: 300 }, marcadores)).toBeNull();
    expect(imantar({ x: 100, y: 100 }, [{ id: 'justo', x: 144, y: 100 }])?.id).toBe('justo');
    expect(imantar({ x: 100, y: 100 }, [{ id: 'fuera', x: 145, y: 100 }])).toBeNull();
  });

  it('deshacer quita el último y borrar lo quita todo', () => {
    let v = anadir([], O);
    v = anadir(v, alNorte(50));
    expect(puedeDeshacer(v)).toBe(true);
    v = deshacer(v);
    expect(v).toEqual([O]);
    expect(puedeDeshacer(v)).toBe(false);
    expect(borrar()).toEqual([]);
  });
});

// docs/19 RV-67: la etiqueta iba centrada sobre la línea y la línea la tachaba.
describe('etiqueta al lado del tramo (RV-67)', () => {
  it('14 px en perpendicular, hacia arriba en un tramo horizontal', () => {
    const d = desplazamientoEtiqueta({ x: 0, y: 100 }, { x: 125, y: 100 });
    expect(d.x).toBeCloseTo(0);
    expect(d.y).toBeCloseTo(-14);
  });

  it('en un tramo inclinado, perpendicular y a 14 px', () => {
    const d = desplazamientoEtiqueta({ x: 0, y: 0 }, { x: 100, y: 100 });
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(14);
    expect(d.x * 100 + d.y * 100).toBeCloseTo(0); // perpendicular al tramo
    expect(d.y).toBeLessThan(0);
  });

  it('en un tramo vertical, hacia la derecha; sin tramo, hacia arriba', () => {
    const d = desplazamientoEtiqueta({ x: 10, y: 0 }, { x: 10, y: 80 });
    expect(d.x).toBeCloseTo(14);
    expect(d.y).toBeCloseTo(0);
    expect(desplazamientoEtiqueta({ x: 1, y: 1 }, { x: 1, y: 1 })).toEqual({ x: 0, y: -14 });
  });

  it('resumen da los extremos de cada tramo etiquetado', () => {
    const r = resumen([O, { lat: O.lat + 80 / 111_195, lng: O.lng }], 20);
    expect(r.etiquetas[0]).toMatchObject({ desde: O, hasta: { lat: O.lat + 80 / 111_195, lng: O.lng } });
  });
});
