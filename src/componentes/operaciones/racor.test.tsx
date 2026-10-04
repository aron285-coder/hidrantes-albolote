// docs/24 RV-104: Granada y Barcelona con su foto de referencia encima del nombre (FR-20); «Otro»
// sin foto. Mientras el desarrollador no ponga las fotos, el botón se ve como antes: sin <img> roto.
// Vitest corre en Node: se pinta a HTML con react-dom/server.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { SelectorRacor } from './Campos';
import { URL_FOTO_RACOR, marcarFotoRacor, olvidarFotosRacor } from '@/lib/racores';
import { T } from '@/lib/textos';

/** Cada botón del selector: su texto, si está marcado y la etiqueta <img> que lleve dentro. */
function botones(html: string) {
  return [...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)].map(([, atributos, dentro]) => ({
    texto: dentro.replace(/<[^>]+>/g, '').trim(),
    marcado: /aria-checked="true"/.test(atributos),
    img: /<img\b[^>]*>/.exec(dentro)?.[0] ?? null,
  }));
}

const pintar = (valor?: 'granada' | 'barcelona' | 'otro') =>
  botones(renderToStaticMarkup(<SelectorRacor valor={valor} alCambiar={() => {}} />));

beforeEach(() => olvidarFotosRacor());

describe('foto de referencia del racor (RV-104)', () => {
  it('sin las fotos en el servidor no hay <img> en ningún botón y el nombre sigue', () => {
    marcarFotoRacor('granada', 'falta');
    marcarFotoRacor('barcelona', 'falta');
    const b = pintar('granada');
    expect(b.map((x) => x.texto)).toEqual([T.formulario.barcelona, T.formulario.granada, T.formulario.otro]);
    expect(b.every((x) => x.img === null)).toBe(true);
    expect(b[1].marcado).toBe(true);
  });

  it('antes de saber si están, la imagen se pide pero no se ve (nunca un icono roto)', () => {
    const [, granada] = pintar();
    expect(granada.img).toContain(`src="${URL_FOTO_RACOR.granada}"`);
    expect(granada.img).toMatch(/class="[^"]*\bhidden\b/);
  });

  it('con la foto, <img> de 48 × 48 con alt vacío dentro del botón, y la selección no cambia', () => {
    marcarFotoRacor('granada', 'ok');
    marcarFotoRacor('barcelona', 'ok');
    for (const valor of [undefined, 'barcelona'] as const) {
      const [barcelona, granada, otro] = pintar(valor);
      for (const x of [granada, barcelona]) {
        expect(x.img).toContain('alt=""');
        expect(x.img).toContain('width="48"');
        expect(x.img).toContain('height="48"');
        expect(x.img).not.toMatch(/\bhidden\b/);
      }
      expect(otro.img).toBeNull();
      expect([granada.marcado, barcelona.marcado, otro.marcado]).toEqual([false, valor === 'barcelona', false]);
      expect(granada.texto).toBe(T.formulario.granada);
    }
  });

  // docs/25 RV-112 (DEC-163): «Tipo de enganche», con Barcelona, Granada y Otro en este orden.
  it('el grupo se llama "Tipo de enganche" y las opciones van Barcelona, Granada, Otro', () => {
    const html = renderToStaticMarkup(<SelectorRacor alCambiar={() => {}} />);
    expect(html).toContain('role="radiogroup" aria-label="Tipo de enganche"');
    expect(botones(html).map((x) => x.texto)).toEqual(['Barcelona', 'Granada', 'Otro']);
  });

  it('las fotos van en public/racores', () => {
    expect(URL_FOTO_RACOR).toEqual({ granada: '/racores/granada.webp', barcelona: '/racores/barcelona.webp' });
  });

  it('entran en el precache del Service Worker, para verlas sin cobertura', () => {
    const config = readFileSync(path.resolve(import.meta.dirname, '../../../vite.config.ts'), 'utf8');
    const patron = /globPatterns:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? '';
    expect(patron).toMatch(/webp/);
  });
});
