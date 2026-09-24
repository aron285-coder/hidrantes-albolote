import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type ElementoOverpass,
  MAX_BYTES,
  construirCallejero,
  consulta,
  mismoCallejero,
  motivoDemasiadoGrande,
  serializarCallejero,
  unirTramos,
} from './lib/callejero.ts';
import { RAIZ } from './lib/comun.ts';

const leer = (relativa: string) => JSON.parse(readFileSync(path.join(RAIZ, relativa), 'utf8'));
const limites = leer('datos/limite-municipal.geojson');
const zona = leer('datos/zona-cobertura.geojson').features[0];
const ejemplo = leer('scripts/fixtures/overpass-callejero.json') as { elements: ElementoOverpass[] };
const callejero = construirCallejero(ejemplo.elements, { limites, zona, version: '20260923' });
const nombres = callejero.entradas.map((e) => `${e.n}|${e.m ?? ''}|${e.t}`);

describe('construirCallejero', () => {
  it('une los tramos con el mismo nombre y municipio en una sola línea', () => {
    const real = callejero.entradas.find((e) => e.n === 'Calle Real' && e.m === 'albolote')!;
    expect(real.g).toHaveLength(1);
    expect(real.g![0][0]).toEqual([-3.658, 37.231]);
    expect(real.g![0].at(-1)).toEqual([-3.656, 37.233]);
  });

  it('asigna el municipio: la misma calle en Calicasas es otra entrada', () => {
    expect(nombres).toContain('Calle Real|albolote|calle');
    expect(nombres).toContain('Calle Real|calicasas|calle');
  });

  it('descarta lo que queda fuera de la zona', () => {
    expect(nombres.some((n) => n.startsWith('Calle de Fuera'))).toBe(false);
    expect(nombres.some((n) => n.startsWith('Pueblo de Fuera'))).toBe(false);
  });

  it('las sendas solo entran con nombre de calle, y lo no construido no entra', () => {
    expect(nombres).toContain('Paseo del Río|albolote|calle');
    expect(nombres.some((n) => n.startsWith('Sendero'))).toBe(false);
    expect(nombres.some((n) => n.startsWith('Calle Nueva'))).toBe(false);
  });

  it('lugares con su punto, sin repetir el mismo equipamiento', () => {
    expect(nombres.filter((n) => n.startsWith('Colegio Público'))).toHaveLength(1);
    expect(callejero.entradas.find((e) => e.n === 'Albolote')).toMatchObject({ t: 'lugar', c: [-3.6571, 37.2306] });
  });

  it('coordenadas redondeadas a 5 decimales', () => {
    const decimales = JSON.stringify(callejero.entradas).match(/\d+\.(\d+)/g)!;
    expect(decimales.every((d) => d.split('.')[1].length <= 5)).toBe(true);
  });
});

describe('tamaño y regeneración', () => {
  it('falla por encima de 200 kB (TR-117)', () => {
    expect(motivoDemasiadoGrande('x'.repeat(MAX_BYTES))).toBeNull();
    expect(motivoDemasiadoGrande('x'.repeat(MAX_BYTES + 1))).toMatch(/200 kB/);
  });

  it('el callejero committeado cabe', () => {
    expect(motivoDemasiadoGrande(readFileSync(path.join(RAIZ, 'public', 'callejero.json'), 'utf8'))).toBeNull();
  });

  it('otra fecha con los mismos datos no es un cambio (DEC-070)', () => {
    const otro = serializarCallejero({ ...callejero, version: '20261001' });
    expect(mismoCallejero(otro, serializarCallejero(callejero))).toBe(true);
    const distinto = serializarCallejero({ ...callejero, entradas: callejero.entradas.slice(1) });
    expect(mismoCallejero(distinto, serializarCallejero(callejero))).toBe(false);
  });

  it('una línea por entrada y JSON válido', () => {
    const texto = serializarCallejero(callejero);
    expect(JSON.parse(texto)).toEqual(callejero);
    expect(texto.split('\n')).toHaveLength(callejero.entradas.length + 3);
  });
});

describe('unirTramos', () => {
  it('une dando la vuelta a un tramo y deja aparte lo que no toca', () => {
    const unidos = unirTramos([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [2, 0],
        [1, 0],
      ],
      [
        [5, 5],
        [6, 6],
      ],
    ]);
    expect(unidos).toEqual([
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      [
        [5, 5],
        [6, 6],
      ],
    ]);
  });
});

describe('consulta', () => {
  it('pide calles con geometría y lugares con su centro, dentro del recuadro', () => {
    const q = consulta([-3.71, 37.2, -3.6, 37.4]);
    expect(q).toContain('[bbox:37.2,-3.71,37.4,-3.6]');
    expect(q).toContain('way[highway][name]');
    expect(q).toContain('out center tags');
  });
});
