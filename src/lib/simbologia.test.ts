// Las 12 combinaciones de 06 §4.2 (criterio de salida de la Fase 5) y las variantes de §4.3–4.4.

import { describe, expect, it } from 'vitest';
import type { Caudal, TipoPunto } from './puntos';
import { COLOR_CAUDAL, esquina, grosorBorde, radioMinimo, svgMarcador, visibleEnZoom } from './simbologia';

/** Radios de la escala inicial tal como los calcula fn_radio_px (06 §4.1). */
const R = { R1: 11, R2: 9, R3: 7, R4: 5.5, R5: 5 };
const TABLA: [TipoPunto, number, Caudal, number][] = [
  ['hidrante', 100, 'bueno', R.R1],
  ['hidrante', 100, 'regular', R.R2],
  ['hidrante', 100, 'malo', R.R3],
  ['hidrante', 100, 'no_funciona', R.R5],
  ['hidrante', 70, 'bueno', R.R2],
  ['hidrante', 70, 'regular', R.R3],
  ['hidrante', 70, 'malo', R.R4],
  ['hidrante', 70, 'no_funciona', R.R5],
  ['boca_riego', 45, 'bueno', R.R3],
  ['boca_riego', 45, 'regular', R.R4],
  ['boca_riego', 45, 'malo', R.R4],
  ['boca_riego', 45, 'no_funciona', R.R5],
];

function dibujar(svg: string) {
  const attr = (sel: RegExp) => sel.exec(svg)?.[1];
  return {
    forma: attr(/data-forma="(\w+)"/),
    r: attr(/<circle data-forma="circulo" r="([\d.]+)"/) ?? String(Number(attr(/<rect[^>]* width="([\d.]+)"/)) / 2),
    relleno: attr(/fill="(var\([^)]+\))"/),
    opacidad: attr(/opacity="([\d.]+)"/),
    borde: attr(/stroke-width="([\d.]+)"/),
    discontinuo: svg.includes('stroke-dasharray="3 2.5"'),
    tachado: svg.includes('data-tachado'),
    esquina: attr(/rx="([\d.]+)"/),
  };
}

describe('las doce combinaciones (06 §4.2)', () => {
  it.each(TABLA)('%s %i mm %s → radio %d', (tipo, _d, caudal, radio) => {
    const s = dibujar(svgMarcador({ tipo, caudal, radio_px: radio, revision_caducada: false }));
    expect(s.forma).toBe(tipo === 'hidrante' ? 'circulo' : 'cuadrado');
    expect(Number(s.r)).toBe(radio);
    expect(s.relleno).toBe(COLOR_CAUDAL[caudal]);
    expect(Number(s.borde)).toBe(radio <= 5.5 ? 2 : 2.5);
    expect(s.tachado).toBe(caudal === 'no_funciona');
    expect(s.opacidad).toBe(caudal === 'no_funciona' ? '0.5' : undefined);
    expect(s.discontinuo).toBe(false);
    if (tipo === 'boca_riego') expect(Number(s.esquina)).toBe(esquina(radio));
  });

  it('cinco colores de estado, uno por nivel y sin "defecto" (Barro: docs/24 RV-102)', () => {
    expect(COLOR_CAUDAL).toEqual({
      bueno: 'var(--verde-600)',
      regular: 'var(--amarillo-500)',
      malo: 'var(--rojo-700)',
      barro: 'var(--marron-600)',
      no_funciona: 'var(--gris-700)',
    });
  });
});

describe('borde por estado (docs/25 RV-105, DEC-154)', () => {
  const trazo = (svg: string) => /data-forma="\w+"[^>]* stroke="(var\([^)]+\))"/.exec(svg)?.[1];

  it.each(TABLA)('%s %i mm %s lleva el borde de su estado', (tipo, _d, caudal, radio) => {
    const svg = svgMarcador({ tipo, caudal, radio_px: radio, revision_caducada: false });
    expect(trazo(svg)).toBe(caudal === 'regular' ? 'var(--borde-marcador-regular)' : 'var(--borde-marcador)');
  });

  it('regular sin revisar: el borde oscuro, discontinuo', () => {
    const svg = svgMarcador({ tipo: 'boca_riego', caudal: 'regular', radio_px: 7, revision_caducada: true });
    expect(trazo(svg)).toBe('var(--borde-marcador-regular)');
    expect(svg).toContain('stroke-dasharray="3 2.5"');
  });

  it('barro, con el borde de siempre también en el tachado', () => {
    const svg = svgMarcador({ tipo: 'hidrante', caudal: 'barro', radio_px: 9, revision_caducada: false });
    expect(trazo(svg)).toBe('var(--borde-marcador)');
    expect(svg).toMatch(/<line data-tachado[^>]* stroke="var\(--borde-marcador\)"/);
  });
});

describe('variantes (06 §4.3)', () => {
  it('sin revisar: borde discontinuo con el mismo tamaño y color', () => {
    const s = dibujar(svgMarcador({ tipo: 'hidrante', caudal: 'bueno', radio_px: 11, revision_caducada: true }));
    expect(s.discontinuo).toBe(true);
    expect(Number(s.r)).toBe(11);
    expect(s.relleno).toBe(COLOR_CAUDAL.bueno);
  });

  it('esquinas del cuadrado: 3, 2,5 a 5,5 px y 2 a 5 px', () => {
    expect([esquina(7), esquina(5.5), esquina(5)]).toEqual([3, 2.5, 2]);
    expect([grosorBorde(7), grosorBorde(5.5)]).toEqual([2.5, 2]);
  });

  it('seleccionado: anillo a 3 px del borde', () => {
    const svg = svgMarcador(
      { tipo: 'hidrante', caudal: 'bueno', radio_px: 11, revision_caducada: false },
      { seleccionado: true },
    );
    expect(svg).toContain('<circle data-seleccion r="16.5"');
  });

  it('lienzo de 44 px: el objetivo táctil no depende del radio', () => {
    const svg = svgMarcador({ tipo: 'boca_riego', caudal: 'malo', radio_px: 5.5, revision_caducada: false });
    expect(svg).toMatch(/width="44" height="44" viewBox="-22 -22 44 44"/);
  });
});

// docs/24 RV-102a: el servidor puede traer un estado nuevo antes de que el móvil se actualice.
describe('caudal desconocido (RV-102a)', () => {
  it('se dibuja como no funciona y sin «undefined» en el SVG', () => {
    const svg = svgMarcador({
      tipo: 'boca_riego',
      caudal: 'otro_valor' as Caudal,
      radio_px: 5,
      revision_caducada: false,
    });
    const s = dibujar(svg);
    expect(svg).not.toContain('undefined');
    expect(s.relleno).toBe(COLOR_CAUDAL.no_funciona);
    expect(s.tachado).toBe(true);
    expect(s.opacidad).toBe('0.5');
  });
});

describe('declutter por zoom (06 §4.4)', () => {
  it('z ≤ 13 solo R1–R2; 14–15 hasta R3; desde 16 todos', () => {
    expect([radioMinimo(12), radioMinimo(13), radioMinimo(14), radioMinimo(15), radioMinimo(16)]).toEqual([
      9, 9, 7, 7, 0,
    ]);
    expect(visibleEnZoom(9, 13)).toBe(true);
    expect(visibleEnZoom(7, 13)).toBe(false);
    expect(visibleEnZoom(7, 14)).toBe(true);
    expect(visibleEnZoom(5, 15)).toBe(false);
    expect(visibleEnZoom(5, 16)).toBe(true);
  });
});
