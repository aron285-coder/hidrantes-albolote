// docs/34 RV-355: los tintes de aviso y de los chips cambian fondo y texto a la vez en oscuro. Cada
// pareja llega a 4,5:1 (TR-31) en claro y en los dos bloques de oscuro, para que un cambio de valor no
// lo rompa en silencio. Y ningún componente vuelve a los fondos -100, que en oscuro se quedaban claros.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = path.resolve(import.meta.dirname, '..');
// Sin comentarios: alguno nombra una variable seguida de dos puntos («sobre --verde-100: el 600…»).
const css = readFileSync(path.join(raiz, 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const TINTES = ['verde', 'ambar', 'oro', 'rojo', 'amarillo', 'marron'] as const;

/** Los valores de un bloque: desde su selector hasta la primera llave que lo cierra. */
function bloque(selector: string): Map<string, string> {
  const desde = css.indexOf(selector);
  expect(desde, selector).toBeGreaterThan(-1);
  const cuerpo = css.slice(css.indexOf('{', desde + selector.length - 1) + 1, css.indexOf('}', desde));
  return new Map([...cuerpo.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

/** El valor de una variable, siguiendo los `var(--otra)` hasta un color. */
function resolver(valores: Map<string, string>, nombre: string): string | undefined {
  let v = valores.get(nombre);
  for (let i = 0; v && i < 5; i++) {
    const m = /^var\((--[\w-]+)\)$/.exec(v);
    if (!m) break;
    v = valores.get(m[1]!);
  }
  return v;
}

function luminancia(hex: string): number {
  const v = /^#([0-9a-f]{6})$/i.exec(hex);
  expect(v, `${hex} no es un color #rrggbb`).not.toBeNull();
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(v![1]!.slice(i, i + 2), 16) / 255;
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

describe('parejas de tinte (docs/34 RV-355)', () => {
  for (const [modo, valores] of Object.entries(modos)) {
    it.each(TINTES)(`%s llega a 4,5:1 en ${modo}`, (tinte) => {
      const fondo = resolver(valores, `--tinte-${tinte}`);
      const texto = resolver(valores, `--tinte-${tinte}-texto`);
      expect(fondo, `--tinte-${tinte}`).toBeDefined();
      expect(texto, `--tinte-${tinte}-texto`).toBeDefined();
      expect(contraste(fondo!, texto!)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it.each(TINTES)('%s: en oscuro el fondo es oscuro (no queda una superficie clara)', (tinte) => {
    for (const modo of ['oscuro del sistema', 'oscuro forzado'] as const) {
      expect(luminancia(resolver(modos[modo], `--tinte-${tinte}`)!), modo).toBeLessThan(0.05);
    }
  });

  it.each(TINTES)('%s: borde invisible en claro y visible en oscuro', (tinte) => {
    expect(claro.get(`--tinte-${tinte}-borde`)).toBe('transparent');
    for (const modo of ['oscuro del sistema', 'oscuro forzado'] as const) {
      expect(modos[modo].get(`--tinte-${tinte}-borde`), modo).toMatch(/^color-mix\(|^#|^rgba\(/);
    }
  });

  it('las tres utilidades de cada tinte están en el tema de Tailwind', () => {
    for (const t of TINTES) {
      expect(css).toContain(`--color-tinte-${t}: var(--tinte-${t});`);
      expect(css).toContain(`--color-tinte-${t}-texto: var(--tinte-${t}-texto);`);
      expect(css).toContain(`--color-tinte-${t}-borde: var(--tinte-${t}-borde);`);
    }
  });
});

describe('ningún componente usa los fondos -100 de aviso (docs/34 RV-355)', () => {
  const archivos = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      return statSync(p).isDirectory() ? archivos(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [];
    });

  it('bg-{verde,ambar,oro,rojo,amarillo,marron}-100 pasan a bg-tinte-*', () => {
    const con = archivos(raiz).filter((p) =>
      /\bbg-(verde|ambar|oro|rojo|amarillo|marron)-100\b/.test(readFileSync(p, 'utf8')),
    );
    expect(con.map((p) => path.relative(raiz, p))).toEqual([]);
  });
});
