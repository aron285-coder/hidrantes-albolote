// docs/35 RV-425: el anillo de foco del teclado se ve en claro, en los dos bloques de oscuro y sobre
// la barra: al menos 3:1 (TR-31, elementos gráficos) contra lo que tiene detrás. Se lee del CSS de
// verdad, como tintes.test.ts, para que un cambio de valor no lo rompa en silencio.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Sin comentarios: alguno nombra una variable seguida de dos puntos.
const css = readFileSync(path.resolve(import.meta.dirname, '../index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Los valores de un bloque: desde su selector hasta la primera llave que lo cierra. */
function bloque(selector: string): Map<string, string> {
  const desde = css.indexOf(selector);
  expect(desde, selector).toBeGreaterThan(-1);
  const cuerpo = css.slice(css.indexOf('{', desde + selector.length - 1) + 1, css.indexOf('}', desde));
  return new Map([...cuerpo.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

/** El valor de una variable, siguiendo los `var(--otra)` hasta un color. */
function resolver(valores: Map<string, string>, nombre: string): string {
  let v = valores.get(nombre);
  for (let i = 0; v && i < 5; i++) {
    const m = /^var\((--[\w-]+)\)$/.exec(v);
    if (!m) break;
    v = valores.get(m[1]!);
  }
  expect(v, nombre).toMatch(/^#[0-9a-f]{6}$/i);
  return v!;
}

function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

const contraste = (a: string, b: string) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
};

const claro = bloque(':root {');
const modos = {
  claro,
  'oscuro del sistema': new Map([...claro, ...bloque(":root:not([data-tema='claro']) {")]),
  'oscuro forzado': new Map([...claro, ...bloque(":root[data-tema='oscuro'] {")]),
};

describe('anillo de foco (docs/35 RV-425)', () => {
  for (const [modo, valores] of Object.entries(modos)) {
    it(`se ve sobre el fondo y las tarjetas en ${modo}`, () => {
      const anillo = resolver(valores, '--anillo-foco');
      for (const fondo of ['--fondo', '--papel']) {
        expect(contraste(anillo, resolver(valores, fondo)), `sobre ${fondo}`).toBeGreaterThanOrEqual(3);
      }
    });

    // La barra y las superficies marino fijas (Bienvenida, avisos de versión e instalar), que no
    // cambian con el modo: sobre ellas, el marino de claro se quedaba en ≈ 1,4:1.
    it(`se ve sobre la barra y las superficies marino en ${modo}`, () => {
      const anillo = resolver(valores, '--anillo-foco-barra');
      for (const fondo of ['--barra', '--marino-950']) {
        expect(contraste(anillo, resolver(valores, fondo)), `sobre ${fondo}`).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it('en claro es el marino de siempre', () => {
    expect(claro.get('--anillo-foco')).toBe('var(--marino-700)');
  });

  it('el foco usa el token, y sobre la barra y las superficies marino su variante', () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--anillo-foco\);/);
    // Todas las reglas con la variante, no solo la primera.
    const selectores = [...css.matchAll(/([^{}]+)\{\s*outline-color:\s*var\(--anillo-foco-barra\);\s*\}/g)].flatMap(
      (r) => r[1]!.split(',').map((s) => s.trim()),
    );
    expect(selectores).toEqual(expect.arrayContaining(['.bg-barra :focus-visible', '.bg-marino-950 :focus-visible']));
  });
});
