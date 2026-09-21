import { describe, expect, it } from 'vitest';
import { mismaGeometria, serializar } from './generar-zona.ts';

const zona = (version: string, x = 0) =>
  serializar({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { margen_m: 400, version },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [x, 0],
              [1, 0],
              [1, 1],
              [x, 0],
            ],
          ],
        },
      },
    ],
  });

describe('mismaGeometria', () => {
  it('la fecha de regeneración no cuenta como cambio (DEC-070)', () => {
    expect(mismaGeometria(zona('2026-09-20'), zona('2026-09-18'))).toBe(true);
  });

  it('un vértice distinto sí cuenta', () => {
    expect(mismaGeometria(zona('2026-09-20', 0.5), zona('2026-09-18'))).toBe(false);
  });

  it('un archivo vacío o de otra cosa cuenta como cambio', () => {
    expect(mismaGeometria(zona('2026-09-20'), '')).toBe(false);
  });
});
