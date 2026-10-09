// Medir distancia en tramos de manguera (FR-76; docs/18 GM-06).

import { describe, expect, it } from 'vitest';
import { longitudLinea } from './geometria';
import {
  MIN_TRAMO_ETIQUETA_PX,
  anadir,
  borrar,
  colocarEtiquetas,
  deshacer,
  imantar,
  puedeDeshacer,
  resumen,
} from './medicion';
import { T } from './textos';

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

// Los extremos de cada tramo etiquetado.
describe('etiquetas de los tramos', () => {
  it('resumen da los extremos de cada tramo etiquetado', () => {
    const r = resumen([O, { lat: O.lat + 80 / 111_195, lng: O.lng }], 20);
    expect(r.etiquetas[0]).toMatchObject({ desde: O, hasta: { lat: O.lat + 80 / 111_195, lng: O.lng } });
  });
});

// docs/33 RV-318 (U9, D7): las etiquetas de dos tramos en ángulo agudo se montaban en el vértice.
describe('colocación de las etiquetas (RV-318)', () => {
  const TAM = { ancho: 56, alto: 22 };
  type Caja = { x0: number; y0: number; x1: number; y1: number };
  const caja = (c: { x: number; y: number }): Caja => ({
    x0: c.x - TAM.ancho / 2,
    y0: c.y - TAM.alto / 2,
    x1: c.x + TAM.ancho / 2,
    y1: c.y + TAM.alto / 2,
  });
  const solapan = (a: Caja, b: Caja) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  /** ¿Corta el segmento a-b la caja? (muestreo fino: basta para cajas de 56 × 22 px). */
  const tacha = (a: { x: number; y: number }, b: { x: number; y: number }, k: Caja) => {
    for (let t = 0; t <= 1; t += 0.005) {
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (x > k.x0 && x < k.x1 && y > k.y0 && y < k.y1) return true;
    }
    return false;
  };

  // Dos tramos de 410 y 362 px que salen del mismo vértice con unos 20° entre ellos (la «V» del recorrido).
  const V = [
    { x: 40, y: 300 },
    { x: 440, y: 210 },
    { x: 90, y: 160 },
  ];

  it('con dos tramos en ángulo agudo, las etiquetas no se pisan ni las tacha ninguna línea', () => {
    const [e1, e2] = colocarEtiquetas(V, [true, true], TAM);
    expect(e1!.visible && e2!.visible).toBe(true);
    const [k1, k2] = [caja(e1!), caja(e2!)];
    expect(solapan(k1, k2)).toBe(false);
    for (const k of [k1, k2]) {
      expect(tacha(V[0]!, V[1]!, k)).toBe(false);
      expect(tacha(V[1]!, V[2]!, k)).toBe(false);
    }
  });

  it('cada etiqueta va hacia fuera del ángulo: la del primer tramo, al otro lado del segundo', () => {
    const [e1, e2] = colocarEtiquetas(V, [true, true], TAM);
    // El segundo tramo queda por encima del primero: la etiqueta del primero va por debajo, y al revés.
    const medio1 = { x: (V[0]!.x + V[1]!.x) / 2, y: (V[0]!.y + V[1]!.y) / 2 };
    const medio2 = { x: (V[1]!.x + V[2]!.x) / 2, y: (V[1]!.y + V[2]!.y) / 2 };
    expect(e1!.y).toBeGreaterThan(medio1.y);
    expect(e2!.y).toBeLessThan(medio2.y);
  });

  it('un tramo de menos de 70 px en pantalla no lleva etiqueta (sale al acercar)', () => {
    const corto = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
    ];
    expect(colocarEtiquetas(corto, [true], TAM)[0]!.visible).toBe(false);
    const largo = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
    ];
    expect(colocarEtiquetas(largo, [true], TAM)[0]!.visible).toBe(true);
    expect(MIN_TRAMO_ETIQUETA_PX).toBe(70);
  });

  it('un tramo solo: la etiqueta por encima, sin que la línea la tache', () => {
    const solo = [
      { x: 0, y: 100 },
      { x: 200, y: 100 },
    ];
    const [e] = colocarEtiquetas(solo, [true], TAM);
    expect(e!.y).toBeLessThan(100);
    expect(tacha(solo[0]!, solo[1]!, caja(e!))).toBe(false);
  });

  it('el total en la barra: «772 m · 39 tramos de manguera de 20 m»', () => {
    expect(T.medir.resultado('772 m', 39, 20)).toBe('772 m · 39 tramos de manguera de 20 m');
    expect(T.medir.resultado('15 m', 1, 20)).toBe('15 m · 1 tramo de manguera de 20 m');
  });
});
