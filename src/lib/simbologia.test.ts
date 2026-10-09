// Las 12 combinaciones de 06 §4.2 (criterio de salida de la Fase 5) y las variantes de §4.3–4.4.

import { describe, expect, it } from 'vitest';
import type { Caudal, TipoPunto } from './puntos';
import {
  COLOR_CAUDAL,
  OBJETIVO_TACTIL,
  esquina,
  grosorBorde,
  radioMinimo,
  svgMarcador,
  visibleEnZoom,
} from './simbologia';

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
    discontinuo: /data-forma="\w+"[^>]*stroke-dasharray/.test(svg),
    tachado: svg.includes('data-tachado'),
    esquina: attr(/rx="([\d.]+)"/),
  };
}

describe('las doce combinaciones (06 §4.2)', () => {
  it.each(TABLA)('%s %i mm %s → radio %d', (tipo, _d, caudal, radio) => {
    const s = dibujar(svgMarcador({ tipo, caudal, radio_px: radio, revision_caducada: false }));
    expect(s.forma).toBe(tipo === 'hidrante' ? 'circulo' : 'cuadrado');
    expect(Number(s.r)).toBe(radio);
    // No funciona: blanco con borde gris y un aspa (docs/33 RV-319); sin atenuar ni tachar.
    expect(s.relleno).toBe(caudal === 'no_funciona' ? 'var(--borde-marcador)' : COLOR_CAUDAL[caudal]);
    expect(Number(s.borde)).toBe(caudal === 'no_funciona' ? 1.5 : radio <= 5.5 ? 2 : 2.5);
    expect(s.tachado).toBe(false);
    expect(s.opacidad).toBe(undefined);
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
    const esperado =
      caudal === 'regular'
        ? 'var(--borde-marcador-regular)'
        : caudal === 'no_funciona'
          ? 'var(--gris-700)'
          : 'var(--borde-marcador)';
    expect(trazo(svg)).toBe(esperado);
  });

  it('regular sin revisar: el borde oscuro y continuo; "sin revisar" lo dice el anillo', () => {
    const svg = svgMarcador({ tipo: 'boca_riego', caudal: 'regular', radio_px: 7, revision_caducada: true });
    expect(trazo(svg)).toBe('var(--borde-marcador-regular)');
    expect(svg).toContain('data-sin-revisar');
    expect(svg).not.toMatch(/data-forma="\w+"[^>]*stroke-dasharray/);
  });

  // docs/33 RV-319 (U10): a tamaño de leyenda, Barro y No funciona eran dos iconos rayados casi iguales.
  it('barro: marrón lleno con una «B» blanca, sin tachar', () => {
    for (const tipo of ['hidrante', 'boca_riego'] as const) {
      const svg = svgMarcador({ tipo, caudal: 'barro', radio_px: 5, revision_caducada: false });
      expect(trazo(svg)).toBe('var(--borde-marcador)');
      expect(svg).not.toContain('data-tachado');
      expect(svg).toMatch(/<text data-letra[^>]* fill="var\(--borde-marcador\)"[^>]*>B<\/text>/);
      expect(svg).not.toContain('data-aspa');
    }
  });

  it('no funciona: blanco con borde gris y un aspa gris, sin atenuar', () => {
    for (const tipo of ['hidrante', 'boca_riego'] as const) {
      const svg = svgMarcador({ tipo, caudal: 'no_funciona', radio_px: 5, revision_caducada: false });
      const s = dibujar(svg);
      expect(s.relleno).toBe('var(--borde-marcador)');
      expect(trazo(svg)).toBe('var(--gris-700)');
      expect(s.opacidad).toBeUndefined();
      expect(svg.match(/<line data-aspa[^>]* stroke="var\(--gris-700\)"/g)).toHaveLength(2);
      expect(svg).not.toContain('data-letra');
    }
  });

  it('se distinguen sin color: uno lleva letra y el otro aspa (WCAG 1.4.1)', () => {
    const barro = svgMarcador({ tipo: 'hidrante', caudal: 'barro', radio_px: 5, revision_caducada: false });
    const nf = svgMarcador({ tipo: 'hidrante', caudal: 'no_funciona', radio_px: 5, revision_caducada: false });
    const sinColor = (s: string) => s.replace(/(fill|stroke)="[^"]*"/g, '');
    expect(sinColor(barro)).not.toBe(sinColor(nf));
    // Y las marcas se ven: la «B» blanca sobre el marrón y un aspa gris de largo > 0 (su contraste, en
    // accesibilidad.test.ts).
    expect(barro).toMatch(/<text data-letra[^>]* fill="var\(--borde-marcador\)"/);
    const aspa = /<line data-aspa x1="(-?[\d.]+)"[^>]* x2="(-?[\d.]+)"[^>]* stroke="var\(--gris-700\)"/.exec(nf);
    expect(Math.abs(Number(aspa?.[2]) - Number(aspa?.[1]))).toBeGreaterThan(0);
  });

  it('la letra crece con el radio y cabe dentro del marcador', () => {
    const letra = (r: number) =>
      Number(
        /<text data-letra[^>]* font-size="([\d.]+)"/.exec(
          svgMarcador({ tipo: 'hidrante', caudal: 'barro', radio_px: r, revision_caducada: false }),
        )?.[1],
      );
    expect(letra(5)).toBeGreaterThan(0);
    expect(letra(11)).toBeGreaterThan(letra(5));
    for (const r of [5, 5.5, 7, 9, 11]) expect(letra(r)).toBeLessThanOrEqual(2 * r * 0.8);
  });
});

describe('variantes (06 §4.3)', () => {
  it('sin revisar: mismo tamaño y color, con el borde continuo (DEC-155)', () => {
    const s = dibujar(svgMarcador({ tipo: 'hidrante', caudal: 'bueno', radio_px: 11, revision_caducada: true }));
    expect(s.discontinuo).toBe(false);
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

// docs/25 RV-107 (DEC-155): un borde discontinuo de 3 2.5 sobre un radio de 5 a 7 px parecía una
// rueda dentada. El borde es siempre continuo y "sin revisar" es un anillo exterior de 8 rayas.
describe('sin revisar: anillo exterior de 8 rayas (docs/25 RV-107, DEC-155)', () => {
  const RADIOS = Object.entries(R);
  const anillo = (svg: string) => /<(circle|rect) data-sin-revisar[^>]*\/>/.exec(svg)?.[0];
  const num = (el: string, a: string) => Number(new RegExp(` ${a}="(-?[\\d.]+)"`).exec(el)?.[1]);
  const dash = (el: string) => /stroke-dasharray="([\d.]+) ([\d.]+)"/.exec(el)?.slice(1).map(Number);
  /** De la cara exterior del borde a la cara interior del anillo (anillo de 1,5 px). */
  const SEPARACION = 2.5;

  it.each(RADIOS)('hidrante %s (r %d): borde continuo y anillo con dash = gap = perímetro / 16', (_n, r) => {
    const svg = svgMarcador({ tipo: 'hidrante', caudal: 'bueno', radio_px: r, revision_caducada: true });
    expect(/data-forma="circulo"[^>]*stroke-dasharray/.test(svg)).toBe(false);
    const el = anillo(svg)!;
    expect(el).toMatch(/^<circle/);
    const ra = num(el, 'r');
    expect(ra - 0.75 - (r + grosorBorde(r) / 2)).toBeCloseTo(SEPARACION, 5);
    expect(el).toContain('stroke-width="1.5"');
    expect(el).toContain('fill="none"');
    expect(el).toContain('stroke="var(--anillo-sin-revisar)"');
    const [d, g] = dash(el)!;
    expect(d).toBeCloseTo((2 * Math.PI * ra) / 16, 2);
    expect(g).toBeCloseTo(d!, 5);
  });

  it.each(RADIOS)('boca de riego %s (r %d): cuadrado concéntrico, dash = perímetro / 16', (_n, r) => {
    const svg = svgMarcador({ tipo: 'boca_riego', caudal: 'malo', radio_px: r, revision_caducada: true });
    expect(/data-forma="cuadrado"[^>]*stroke-dasharray/.test(svg)).toBe(false);
    const el = anillo(svg)!;
    expect(el).toMatch(/^<rect/);
    const lado = num(el, 'width');
    const rx = num(el, 'rx');
    expect(num(el, 'height')).toBe(lado);
    expect(num(el, 'x')).toBeCloseTo(-lado / 2, 5);
    expect(lado / 2 - 0.75 - (r + grosorBorde(r) / 2)).toBeCloseTo(SEPARACION, 5);
    const perimetro = 4 * lado - (8 - 2 * Math.PI) * rx;
    const [d, g] = dash(el)!;
    expect(d).toBeCloseTo(perimetro / 16, 2);
    expect(g).toBeCloseTo(d!, 5);
  });

  it.each([null, undefined, Number.NaN, 0, -3])('un radio roto (%s) se dibuja con el mínimo, sin NaN', (radio) => {
    const svg = svgMarcador(
      { tipo: 'hidrante', caudal: 'bueno', radio_px: radio as unknown as number, revision_caducada: true },
      { tamano: 24, seleccionado: true },
    );
    expect(svg).not.toMatch(/NaN|null|undefined/);
    expect(svg).toContain('<circle data-forma="circulo" r="5"');
  });

  it('un punto revisado no lleva anillo', () => {
    for (const tipo of ['hidrante', 'boca_riego'] as const) {
      const svg = svgMarcador({ tipo, caudal: 'bueno', radio_px: 7, revision_caducada: false });
      expect(svg).not.toContain('data-sin-revisar');
      expect(svg).not.toContain('stroke-dasharray');
    }
  });

  /** El punto del anillo de sin revisar más lejos del centro (en el cuadrado, sobre el arco de la esquina). */
  function lejosAnillo(el: string): number {
    if (el.startsWith('<circle')) return num(el, 'r') + 0.75;
    const h = num(el, 'width') / 2;
    const rx = num(el, 'rx');
    return Math.SQRT2 * (h - rx) + rx + 0.75;
  }
  /** Medio lado de la caja que ocupa el dibujo, en unidades del viewBox (el lienzo es cuadrado). */
  function alcance(svg: string): number {
    const sel = /<circle data-seleccion r="([\d.]+)"/.exec(svg);
    const el = anillo(svg);
    const delAnillo = !el ? 0 : el.startsWith('<circle') ? num(el, 'r') + 0.75 : num(el, 'width') / 2 + 0.75;
    return Math.max(delAnillo, sel ? Number(sel[1]) + 1 : 0);
  }
  const viewBox = (svg: string) => Number(/viewBox="(-?[\d.]+)/.exec(svg)?.[1]);
  /** Los tamaños que existen (06 §4.1): hidrantes de R1 a R5 y bocas de R3 a R5. */
  const REALES = [
    ...RADIOS.map(([, r]) => ['hidrante', r] as const),
    ...[R.R3, R.R4, R.R5].map((r) => ['boca_riego', r] as const),
  ];

  it('en el mapa (44 px) cabe sin recortarse, también seleccionado, y el objetivo táctil no cambia', () => {
    for (const [tipo, r] of REALES)
      for (const seleccionado of [false, true]) {
        const svg = svgMarcador({ tipo, caudal: 'bueno', radio_px: r, revision_caducada: true }, { seleccionado });
        expect(svg).toMatch(/width="44" height="44" viewBox="-22 -22 44 44"/);
        expect(anillo(svg), `${tipo} ${r} lleva anillo`).toBeDefined();
        expect(alcance(svg), `${tipo} ${r} ${seleccionado}`).toBeLessThanOrEqual(OBJETIVO_TACTIL / 2);
      }
  });

  it.each(Object.entries(R))('seleccionado y sin revisar (%s): la selección va 2 px por fuera del anillo', (_n, r) => {
    for (const tipo of ['hidrante', 'boca_riego'] as const) {
      const svg = svgMarcador({ tipo, caudal: 'bueno', radio_px: r, revision_caducada: true }, { seleccionado: true });
      const rs = Number(/<circle data-seleccion r="([\d.]+)"/.exec(svg)?.[1]);
      expect(rs - 1 - lejosAnillo(anillo(svg)!), tipo).toBeGreaterThanOrEqual(2 - 1e-3);
      expect(alcance(svg), `${tipo} cabe en el viewBox`).toBeLessThanOrEqual(-viewBox(svg) + 1e-3);
    }
  });

  it.each([16, 18, 20, 24, 28])('en un lienzo de %i px (lista, leyenda, ficha) el anillo cabe', (tamano) => {
    for (const [, r] of RADIOS)
      for (const tipo of ['hidrante', 'boca_riego'] as const) {
        const svg = svgMarcador({ tipo, caudal: 'bueno', radio_px: r, revision_caducada: true }, { tamano });
        expect(svg).toContain(`width="${tamano}" height="${tamano}"`);
        expect(anillo(svg), `${tipo} ${r} lleva anillo`).toBeDefined();
        expect(alcance(svg), `${tipo} ${r}`).toBeLessThanOrEqual(-viewBox(svg) + 1e-3);
      }
  });

  it('un mismo radio se dibuja a la misma escala revisado o sin revisar', () => {
    for (const [, r] of RADIOS) {
      const a = svgMarcador(
        { tipo: 'hidrante', caudal: 'bueno', radio_px: r, revision_caducada: false },
        { tamano: 24 },
      );
      const b = svgMarcador(
        { tipo: 'hidrante', caudal: 'bueno', radio_px: r, revision_caducada: true },
        { tamano: 24 },
      );
      expect(viewBox(a)).toBe(viewBox(b));
    }
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
    // Como No funciona (docs/33 RV-319): blanco, borde gris y aspa.
    expect(s.relleno).toBe('var(--borde-marcador)');
    expect(svg).toContain('data-aspa');
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
