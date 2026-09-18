// F1.2: diez coordenadas conocidas contra los GeoJSON committeados en datos/ (09 Fase 1).
// Si alguien regenera la zona y algo se rompe (un núcleo fuera, Calicasas perdido, el margen
// tragándose Granada), este test lo para antes de llegar a la base de datos.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  dentroDeZona,
  municipioDe,
  poligonoDeRelacion,
  unirAnillos,
  type RelacionOverpass,
  type Zona,
} from './zona.ts';

const leer = (f: string) => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../datos', f), 'utf8'));
const limites: Zona['limites'] = leer('limite-municipal.geojson');
const zona: Zona['zona'] = leer('zona-cobertura.geojson').features[0];
const nucleos: Zona['nucleos'] = leer('nucleos.geojson');
const meta = leer('meta.json');

// [nombre, lat, lon, municipio esperado (null = fuera de los términos), dentro de la zona con margen]
const COORDENADAS: [string, number, number, 'albolote' | 'calicasas' | null, boolean][] = [
  // Cinco dentro, uno por núcleo de Albolote (FR-53)
  ['Albolote, casco', 37.2306, -3.6568, 'albolote', true],
  ['Cortijo del Aire', 37.2485, -3.6491, 'albolote', true],
  ['El Chaparral', 37.2567, -3.656, 'albolote', true],
  ['Pretel', 37.2455, -3.6696, 'albolote', true],
  ['Parque del Cubillas', 37.2854, -3.6695, 'albolote', true],
  // Dos en Calicasas
  ['Calicasas, pueblo', 37.2733, -3.6186, 'calicasas', true],
  ['Calicasas, norte del pueblo', 37.285, -3.615, 'calicasas', true],
  // Tres fuera
  ['Granada, catedral', 37.1765, -3.599, null, false],
  ['Pinos Puente', 37.2515, -3.7502, null, false],
  ['Iznalloz', 37.3927, -3.5261, null, false],
];

describe('zona de cobertura (datos/)', () => {
  it.each(COORDENADAS)('%s', (_nombre, lat, lon, municipio, dentro) => {
    expect(municipioDe([lon, lat], limites)).toBe(municipio);
    expect(dentroDeZona([lon, lat], zona)).toBe(dentro);
  });

  it('el margen añade unos 400 m: un punto a 300 m del término está dentro y a 800 m no', () => {
    // Al oeste del límite de Albolote (≈ -3.7069 en esta latitud), 1° de longitud ≈ 88,7 km.
    const lat = 37.2533;
    const borde = limites.features[0].geometry.coordinates
      .flat(2)
      .filter(([, y]) => Math.abs(y - lat) < 0.002)
      .reduce((min, [x]) => Math.min(min, x), 0);
    expect(dentroDeZona([borde - 300 / 88_700, lat], zona)).toBe(true);
    expect(dentroDeZona([borde - 800 / 88_700, lat], zona)).toBe(false);
  });

  it('trae los núcleos de FR-53 con su municipio', () => {
    const porNombre = Object.fromEntries(nucleos.features.map((f) => [f.properties.nombre, f.properties.municipio]));
    for (const n of ['Albolote', 'Cortijo del Aire', 'El Chaparral', 'Parque del Cubillas', 'Pretel']) {
      expect(porNombre[n], n).toBe('albolote');
    }
    expect(porNombre.Calicasas).toBe('calicasas');
  });

  it('los límites son MultiPolygon con los dos municipios y meta.json concuerda', () => {
    expect(limites.features.map((f) => f.properties.municipio)).toEqual(['albolote', 'calicasas']);
    for (const f of limites.features) expect(f.geometry.type).toBe('MultiPolygon');
    expect(meta).toMatchObject({ margen_m: 400, nucleos: nucleos.features.length });
    expect(zona.properties.version).toBe(meta.version);
  });

  it('los archivos son ligeros para el móvil (< 50 kB cada uno)', () => {
    for (const f of ['limite-municipal.geojson', 'zona-cobertura.geojson', 'nucleos.geojson']) {
      expect(readFileSync(path.resolve(import.meta.dirname, '../../datos', f)).length, f).toBeLessThan(50_000);
    }
  });
});

describe('unirAnillos', () => {
  it('une vías sueltas, dando la vuelta a las que vienen al revés', () => {
    const anillos = unirAnillos([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [1, 1],
        [1, 0],
      ],
      [
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ]);
    expect(anillos).toHaveLength(1);
    expect(anillos[0][0]).toEqual(anillos[0].at(-1));
    expect(anillos[0]).toHaveLength(5);
  });

  it('aborta si un límite no cierra', () => {
    expect(() =>
      unirAnillos([
        [
          [0, 0],
          [1, 0],
        ],
        [
          [2, 2],
          [3, 3],
        ],
      ]),
    ).toThrow(/sin cerrar/);
  });

  it('asigna los huecos al exterior que los contiene', () => {
    const via = (c: number[][]) => ({ type: 'way' as const, geometry: c.map(([lon, lat]) => ({ lon, lat })) });
    const rel: RelacionOverpass = {
      type: 'relation',
      id: 1,
      tags: {},
      members: [
        {
          ...via([
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4],
            [0, 0],
          ]),
          role: 'outer',
        },
        {
          ...via([
            [1, 1],
            [2, 1],
            [2, 2],
            [1, 1],
          ]),
          role: 'inner',
        },
      ],
    };
    expect(poligonoDeRelacion(rel).geometry.coordinates[0]).toHaveLength(2);
  });
});
