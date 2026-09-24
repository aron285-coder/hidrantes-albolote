import { describe, expect, it } from 'vitest';
import { sqlCarga } from './cargar-zona.ts';
import type { Zona } from './lib/zona.ts';

const limites: Zona['limites'] = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { municipio: 'albolote', nombre: 'Albolote', ine: '18003', osm_id: 1 },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        ],
      },
    },
  ],
};
const nucleos: Zona['nucleos'] = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { nombre: "Cortijo d'Aire", municipio: 'albolote', lugar: 'village', osm_id: 2 },
      geometry: { type: 'Point', coordinates: [0.5, 0.2] },
    },
  ],
};

describe('sqlCarga', () => {
  const sql = sqlCarga(limites, nucleos, '2026-09-18');

  it('es una sola transacción con upsert en las dos tablas', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    expect(sql).toContain('on conflict (municipio) do update');
    expect(sql).toContain('on conflict (nombre) do update');
  });

  it('nunca borra núcleos (jefatura puede añadir los suyos, FR-166)', () => {
    expect(sql.toLowerCase()).not.toMatch(/\bdelete\b|\btruncate\b/);
  });

  it('anota la versión de la zona en config (FR-143)', () => {
    expect(sql).toContain("'version_zona', to_jsonb('2026-09-18'::text)");
  });

  it('escapa las comillas de los nombres', () => {
    expect(sql).toContain("'Cortijo d''Aire'");
  });

  it('fuerza MultiPolygon y SRID 4326', () => {
    expect(sql).toContain('st_multi(');
    expect(sql).toContain(', 4326)');
  });
});
