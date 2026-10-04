// Contraste de los tokens de 06 (TR-31): 4,5:1 en texto y 3:1 en lo que hay que distinguir sobre el
// mapa, en claro y en oscuro. Se leen del CSS de verdad, no de una copia: un token que alguien
// cambie sin mirar 06 hace fallar este test, y no la pantalla de un voluntario a pleno sol.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLORES_MAPA } from './estilo-mapabase';

const css = readFileSync(path.resolve(import.meta.dirname, '../index.css'), 'utf8');

/** Los tokens tal y como quedan en cada modo, con los `var(--otro)` ya resueltos. */
function tokens(modo: 'claro' | 'oscuro'): Record<string, string> {
  const pares = (texto: string): Record<string, string> =>
    Object.fromEntries(
      [...texto.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8}|var\(--[a-z0-9-]+\))\s*;/g)].map((m) => [m[1], m[2]]),
    );
  const claro = pares(/:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '');
  const oscuro = pares(/:root\[data-tema='oscuro'\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '');
  const crudos = { ...claro, ...(modo === 'oscuro' ? oscuro : {}) };
  const resolver = (valor: string, vueltas = 0): string => {
    const ref = /^var\((--[a-z0-9-]+)\)$/.exec(valor);
    return !ref || vueltas > 5 ? valor : resolver(crudos[ref[1]] ?? valor, vueltas + 1);
  };
  return Object.fromEntries(Object.entries(crudos).map(([k, v]) => [k, resolver(v)]));
}

function luminancia(hex: string): number {
  const n = hex.replace('#', '');
  const partes = n.length === 3 ? [...n].map((c) => c + c) : [n.slice(0, 2), n.slice(2, 4), n.slice(4, 6)];
  const [r, g, b] = partes.map((p) => {
    const c = parseInt(p, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste de WCAG 2.1, la que citan TR-31 y 06 §9. */
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const ESTADOS = {
  bueno: '--verde-600',
  regular: '--amarillo-500',
  malo: '--rojo-700',
  barro: '--marron-600',
  no_funciona: '--gris-700',
};

/** El borde de cada estado (DEC-154): el amarillo lleva el suyo, oscuro en los dos mapas. */
const BORDE: Record<keyof typeof ESTADOS, string> = {
  bueno: '--borde-marcador',
  regular: '--borde-marcador-regular',
  malo: '--borde-marcador',
  barro: '--borde-marcador',
  no_funciona: '--borde-marcador',
};

describe('la fórmula, con los casos que todo el mundo conoce', () => {
  it('negro sobre blanco son 21:1 y un color consigo mismo, 1:1', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contraste('#28517f', '#28517f')).toBeCloseTo(1, 5);
  });
});

for (const modo of ['claro', 'oscuro'] as const) {
  describe(`contraste en modo ${modo} (TR-31)`, () => {
    const t = tokens(modo);
    const mapa = COLORES_MAPA[modo];
    const superficies = Object.entries(mapa).filter(([, v]) => typeof v === 'string') as [string, string][];

    it('los tokens del modo se leen del CSS, con los var() resueltos', () => {
      expect(t['--texto']).toMatch(/^#/);
      expect(t['--barra']).toMatch(/^#/);
      expect(t['--anillo-seleccion']).toMatch(/^#/);
      if (modo === 'oscuro') expect(t['--fondo']).not.toBe('#f1f3ee');
    });

    it('el texto llega a 4,5:1 sobre cualquiera de las dos superficies', () => {
      for (const superficie of ['--fondo', '--papel']) {
        expect(contraste(t['--texto'], t[superficie]), `texto sobre ${superficie}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it('el texto suave también: es el de las fechas y los subtítulos, no decoración', () => {
      for (const superficie of ['--fondo', '--papel']) {
        expect(contraste(t['--texto-suave'], t[superficie]), `suave sobre ${superficie}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it('el blanco sobre la barra y sobre los dos rellenos de acción', () => {
      expect(contraste('#ffffff', t['--barra'])).toBeGreaterThanOrEqual(4.5);
      expect(contraste('#ffffff', t['--marino-600'])).toBeGreaterThanOrEqual(4.5);
      // El naranja es el relleno del botón principal: lo lleva el texto blanco de "Enviar" (DEC-072).
      expect(contraste('#ffffff', t['--naranja-600'])).toBeGreaterThanOrEqual(4.5);
    });

    it('el naranja, cuando es texto sobre una superficie, también llega a 4,5:1', () => {
      for (const superficie of ['--papel', '--fondo']) {
        expect(contraste(t['--naranja-texto'], t[superficie]), `naranja sobre ${superficie}`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    });

    // Un marcador se distingue del mapa en dos saltos (06 §4.2): el relleno de estado contra el
    // borde, y uno de los dos contra el mapa. En claro manda el relleno, porque el mapa es claro;
    // en oscuro, el borde blanco (DEC-072). El amarillo de regular es la excepción (DEC-154): es tan
    // claro que en el mapa claro lo separa un borde oscuro, y en el oscuro el blanco no se separa
    // de él (1,96:1), así que allí el borde es oscuro y manda el relleno.
    it('el relleno de estado se separa de su borde', () => {
      for (const [nombre, token] of Object.entries(ESTADOS) as [keyof typeof ESTADOS, string][]) {
        expect(t[BORDE[nombre]], `borde de ${nombre}`).toMatch(/^#/);
        expect(contraste(t[token], t[BORDE[nombre]]), `${nombre} contra el borde`).toBeGreaterThanOrEqual(3);
      }
    });

    it('sobre cualquier superficie del mapa se ve el marcador: relleno o borde llegan a 3:1', () => {
      for (const [donde, fondo] of superficies) {
        for (const [nombre, token] of Object.entries(ESTADOS) as [keyof typeof ESTADOS, string][]) {
          const mejor = Math.max(contraste(t[token], fondo), contraste(t[BORDE[nombre]], fondo));
          expect(mejor, `${nombre} sobre ${donde}`).toBeGreaterThanOrEqual(3);
        }
      }
    });

    it('el anillo del marcador seleccionado se ve sobre el mapa (DEC-062)', () => {
      expect(contraste(t['--anillo-seleccion'], mapa.fondo)).toBeGreaterThanOrEqual(3);
    });

    // DEC-155: "sin revisar" es un anillo fino aparte del marcador, sobre el mapa y no sobre el
    // relleno, así que es él el que tiene que verse contra el fondo del mapa y contra el panel.
    it('el anillo de "sin revisar" se ve sobre el mapa y sobre las superficies (DEC-155)', () => {
      expect(t['--anillo-sin-revisar'], 'token del anillo').toMatch(/^#/);
      for (const [donde, fondo] of [
        ['mapa', mapa.fondo],
        ['--papel', t['--papel']],
        ['--fondo', t['--fondo']],
      ] as const) {
        expect(contraste(t['--anillo-sin-revisar'], fondo!), `anillo sobre ${donde}`).toBeGreaterThanOrEqual(3);
      }
    });

    // El aviso (06 §5) es texto ámbar sobre fondo oro o ámbar claro, y sale en los dos modos con
    // los mismos colores: es una banda que avisa, no una superficie del tema. Se mide aquí porque
    // axe solo lo ve si el aviso está en pantalla, y casi nunca lo está (DEC-081).
    it('el texto de los avisos se lee sobre el fondo del aviso', () => {
      for (const fondo of ['--oro-100', '--ambar-100']) {
        expect(contraste(t['--ambar-700'], t[fondo]), `ámbar sobre ${fondo}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it('las etiquetas de estado se leen sobre su propio fondo claro', () => {
      for (const [texto, fondo] of [
        ['--verde-700', '--verde-100'],
        ['--amarillo-800', '--amarillo-100'],
        ['--rojo-700', '--rojo-100'],
        ['--gris-700', '--gris-100'],
        ['--marron-700', '--marron-100'],
      ]) {
        expect(contraste(t[texto], t[fondo]), `${texto} sobre ${fondo}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    // DEC-154: donde el amarillo es fondo (la banda de la ficha), el texto es marino, nunca blanco.
    it('el texto marino se lee sobre el amarillo de regular', () => {
      expect(contraste(t['--marino-950'], t['--amarillo-500'])).toBeGreaterThanOrEqual(4.5);
    });

    // DEC-154: regular y malo se distinguen también por su claridad, sin depender del tono.
    it('el amarillo de regular y el rojo de malo se separan en luminancia: 3:1', () => {
      expect(contraste(t['--amarillo-500'], t['--rojo-700'])).toBeGreaterThanOrEqual(3);
    });
  });
}

describe('colores de estado RAL (docs/25 RV-105, DEC-154)', () => {
  const t = tokens('claro');

  it('regular es el amarillo RAL 1003, y malo el rojo RAL 3001', () => {
    expect(t['--amarillo-500']?.toLowerCase()).toBe('#f9a900');
    expect(t['--rojo-700']?.toLowerCase()).toBe('#9b2423');
  });

  it('no queda ningún token de naranja de estado', () => {
    expect(css).not.toContain('naranja-estado');
  });

  // El modo oscuro se escribe dos veces en index.css: por el sistema (@media) y elegido a mano
  // (data-tema). Los tests de arriba leen el segundo; aquí se comprueba que el primero dice lo mismo.
  it('los dos bloques del modo oscuro definen los mismos tokens con los mismos valores', () => {
    const bloque = (re: RegExp) =>
      Object.fromEntries(
        [...(re.exec(css)?.[1] ?? '').matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
      );
    const porSistema = bloque(/:root:not\(\[data-tema='claro'\]\)\s*\{([^}]*)\}/);
    const aMano = bloque(/:root\[data-tema='oscuro'\]\s*\{([^}]*)\}/);
    expect(Object.keys(aMano).length).toBeGreaterThan(5);
    expect(porSistema).toEqual(aMano);
  });

  it('en oscuro cambia el borde del amarillo; el de los demás sigue blanco', () => {
    const o = tokens('oscuro');
    expect(o['--borde-marcador-regular']).not.toBe(t['--borde-marcador-regular']);
    expect(o['--borde-marcador']).toBe(t['--borde-marcador']);
  });
});

// docs/24 RV-102 (DEC-149): el marrón de "Barro". Contraste como los demás estados y, además, que
// se distinga de Regular y de Malo también con daltonismo: ΔE2000 ≥ 15 con visión normal y con
// protanopía y deuteranopía simuladas (matrices de Machado, Oliveira y Fernandes, 2009, gravedad 1).
const MACHADO = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
} as const;

const lineal = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function rgbLineal(hex: string, vision: keyof typeof MACHADO | 'normal'): [number, number, number] {
  const l = [1, 3, 5].map((i) => lineal(parseInt(hex.slice(i, i + 2), 16) / 255));
  if (vision === 'normal') return l as [number, number, number];
  return MACHADO[vision].map((f) => Math.min(1, Math.max(0, f[0] * l[0] + f[1] * l[1] + f[2] * l[2]))) as [
    number,
    number,
    number,
  ];
}

function lab([r, g, b]: [number, number, number]): [number, number, number] {
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIEDE2000 (Sharma, Wu y Dalal, 2005). */
export function deltaE2000([L1, a1, b1]: number[], [L2, a2, b2]: number[]): number {
  const rad = Math.PI / 180;
  const Cm = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const tono = (b: number, a: number) => {
    const v = Math.atan2(b, a) / rad;
    return v < 0 ? v + 360 : v;
  };
  const h1p = tono(b1, a1p);
  const h2p = tono(b2, a2p);
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lm = (L1 + L2) / 2;
  const Cmp = (C1p + C2p) / 2;
  let hm = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hm += h1p + h2p < 360 ? 360 : -360;
    hm /= 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hm - 30) * rad) +
    0.24 * Math.cos(2 * hm * rad) +
    0.32 * Math.cos((3 * hm + 6) * rad) -
    0.2 * Math.cos((4 * hm - 63) * rad);
  const giro = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const Sc = 1 + 0.045 * Cmp;
  const Sh = 1 + 0.015 * Cmp * T;
  const Rt = -Math.sin(2 * giro * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

const distanciaColor = (a: string, b: string, vision: keyof typeof MACHADO | 'normal') =>
  deltaE2000(lab(rgbLineal(a, vision)), lab(rgbLineal(b, vision)));

describe('Barro (docs/24 RV-102, DEC-149)', () => {
  const t = tokens('claro');

  it('la fórmula de ΔE2000 da los valores publicados por Sharma (pares 1 y 7)', () => {
    expect(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 3);
    expect(deltaE2000([50, 0, 0], [50, -1, 2])).toBeCloseTo(2.3669, 3);
  });

  it('el texto del chip llega a 4,5:1 sobre su fondo, y el relleno a 3:1 sobre el mapa claro', () => {
    expect(contraste(t['--marron-700'], t['--marron-100'])).toBeGreaterThanOrEqual(4.5);
    expect(contraste(t['--marron-600'], COLORES_MAPA.claro.fondo)).toBeGreaterThanOrEqual(3);
  });

  for (const vision of ['normal', 'protanopia', 'deuteranopia'] as const) {
    it(`se distingue de Regular y de Malo con visión ${vision}: ΔE2000 ≥ 15`, () => {
      for (const otro of ['--amarillo-500', '--rojo-700']) {
        const d = distanciaColor(t['--marron-600'], t[otro], vision);
        expect(d, `barro frente a ${otro}`).toBeGreaterThanOrEqual(15);
      }
    });
  }
});
