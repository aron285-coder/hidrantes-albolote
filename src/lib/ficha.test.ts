import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bandaDe, enlaceComoLlegar, urlFoto } from './ficha';

describe('ficha (FR-66, FR-161)', () => {
  const p = { lat: 37.2308, lng: -3.6569, codigo: 'HID-0147' };

  it('"Cómo llegar" abre la app de mapas de cada plataforma', () => {
    expect(enlaceComoLlegar(p, 'Mozilla/5.0 (Linux; Android 14; Pixel 7)')).toBe(
      'geo:37.230800,-3.656900?q=37.230800,-3.656900(HID-0147)',
    );
    expect(enlaceComoLlegar(p, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(
      'https://maps.apple.com/?daddr=37.230800,-3.656900&dirflg=d',
    );
    expect(enlaceComoLlegar(p, 'Mozilla/5.0 (Windows NT 10.0)')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=37.230800,-3.656900',
    );
  });

  it('foto por ruta pública del bucket del entorno', () => {
    expect(urlFoto('fotos/a b.jpg', 'https://x.supabase.co')).toBe(
      'https://x.supabase.co/storage/v1/object/public/hidrantes-fotos-dev/fotos/a%20b.jpg',
    );
    expect(urlFoto(null, 'https://x.supabase.co')).toBeNull();
  });
});

// docs/25 RV-108 (DEC-156): la banda de la ficha. El texto, blanco o --marino-950, llega a 4,5:1
// sobre el color del estado, en claro y en oscuro. Se mide con los tokens leídos de index.css.
describe('banda de estado de la ficha (RV-108)', () => {
  const css = readFileSync(path.resolve(import.meta.dirname, '../index.css'), 'utf8');

  function tokens(modo: 'claro' | 'oscuro'): Record<string, string> {
    const pares = (texto: string): Record<string, string> =>
      Object.fromEntries(
        [...texto.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8}|var\(--[a-z0-9-]+\))\s*;/g)].map((m) => [m[1], m[2]]),
      );
    const claro = pares(/:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '');
    const oscuro = pares(/:root\[data-tema='oscuro'\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '');
    const crudos = { ...claro, ...(modo === 'oscuro' ? oscuro : {}) };
    const resolver = (v: string, n = 0): string => {
      const ref = /^var\((--[a-z0-9-]+)\)$/.exec(v);
      return !ref || n > 5 ? v : resolver(crudos[ref[1]] ?? v, n + 1);
    };
    return Object.fromEntries(Object.entries(crudos).map(([k, v]) => [k, resolver(v)]));
  }

  const luminancia = (hex: string) => {
    const n = hex.replace('#', '');
    const partes = n.length === 3 ? [...n].map((c) => c + c) : [n.slice(0, 2), n.slice(2, 4), n.slice(4, 6)];
    const [r, g, b] = partes.map((x) => {
      const c = parseInt(x, 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contraste = (a: string, b: string) => {
    const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };

  const ESTADOS = ['bueno', 'regular', 'malo', 'barro', 'no_funciona'] as const;

  for (const modo of ['claro', 'oscuro'] as const) {
    it.each(ESTADOS)(`${modo}: %s, el texto de la banda llega a 4,5:1 sobre su color`, (caudal) => {
      const t = tokens(modo);
      const b = bandaDe(caudal);
      const fondo = t[b.fondo];
      const texto = b.texto.startsWith('--') ? t[b.texto] : b.texto;
      expect(fondo, `${b.fondo} no está en index.css`).toMatch(/^#/);
      expect(texto).toMatch(/^#/);
      expect(contraste(texto!, fondo!)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('las clases de Tailwind son las de los tokens que se miden', () => {
    for (const caudal of ESTADOS) {
      const b = bandaDe(caudal);
      expect(b.clase).toContain(`bg-${b.fondo.slice(2)}`);
      expect(b.clase).toContain(b.texto === '#ffffff' ? 'text-white' : `text-${b.texto.slice(2)}`);
    }
  });

  it('regular, en amarillo, lleva el texto --marino-950 y nunca blanco', () => {
    expect(bandaDe('regular')).toMatchObject({ fondo: '--amarillo-500', texto: '--marino-950' });
  });

  it('un estado que la app no conoce se pinta como no funciona', () => {
    expect(bandaDe('otro_nuevo')).toEqual(bandaDe('no_funciona'));
  });
});
