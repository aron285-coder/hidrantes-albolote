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
  regular: '--naranja-estado-600',
  malo: '--rojo-700',
  no_funciona: '--gris-700',
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
    // en oscuro, el borde blanco. Por eso el borde es blanco en los dos modos (DEC-072).
    it('el relleno de estado se separa del borde del marcador', () => {
      for (const [nombre, token] of Object.entries(ESTADOS)) {
        expect(contraste(t[token], t['--borde-marcador']), `${nombre} contra el borde`).toBeGreaterThanOrEqual(3);
      }
    });

    it('sobre cualquier superficie del mapa se ve el marcador: relleno o borde llegan a 3:1', () => {
      for (const [donde, fondo] of superficies) {
        for (const [nombre, token] of Object.entries(ESTADOS)) {
          const mejor = Math.max(contraste(t[token], fondo), contraste(t['--borde-marcador'], fondo));
          expect(mejor, `${nombre} sobre ${donde}`).toBeGreaterThanOrEqual(3);
        }
      }
    });

    it('el anillo del marcador seleccionado se ve sobre el mapa (DEC-062)', () => {
      expect(contraste(t['--anillo-seleccion'], mapa.fondo)).toBeGreaterThanOrEqual(3);
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
        ['--naranja-estado-700', '--naranja-estado-100'],
        ['--rojo-700', '--rojo-100'],
        ['--gris-700', '--gris-100'],
      ]) {
        expect(contraste(t[texto], t[fondo]), `${texto} sobre ${fondo}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
}
