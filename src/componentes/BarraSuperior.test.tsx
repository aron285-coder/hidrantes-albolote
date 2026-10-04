// docs/26 RV-113 (DEC-164): en el móvil, la etiqueta «Jefatura» de la barra superior abre el panel.
// Es un enlace a /admin con su aria-label y un objetivo táctil de 44 × 44 px (UI-15). Vitest corre en
// Node, sin DOM: se pinta a HTML con react-dom/server y se comprueban las clases de tamaño.

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

// La banda de conexión lee el estado de la app; aquí no pinta nada.
vi.mock('./AvisoConexion', () => ({ AvisoConexion: () => null }));

const { BarraSuperior } = await import('./BarraSuperior');
const { T } = await import('@/lib/textos');

const pintar = (jefatura: boolean) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <BarraSuperior titulo="Hidrantes Albolote" jefatura={jefatura} />
    </MemoryRouter>,
  );

/** Los enlaces de la barra, con sus atributos. */
const enlaces = (html: string) =>
  [...html.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gs)].map(([, a, dentro]) => ({ a, dentro }));

describe('BarraSuperior · etiqueta Jefatura (RV-113)', () => {
  it('con jefatura, la etiqueta es un enlace a /admin con aria-label «Abrir el panel de jefatura»', () => {
    expect(T.jefatura.abrirPanel).toBe('Abrir el panel de jefatura');
    const [enlace, ...otros] = enlaces(pintar(true));
    expect(otros).toEqual([]);
    expect(enlace.a).toContain('href="/admin"');
    expect(enlace.a).toContain(`aria-label="${T.jefatura.abrirPanel}"`);
    expect(enlace.dentro).toContain(T.navegacion.jefatura);
    // El chevron dice que se puede tocar, y no se lee.
    expect(enlace.dentro).toMatch(/<span aria-hidden="true"[^>]*>›<\/span>/);
  });

  it('el área del enlace mide como mínimo 44 × 44 px; el dibujo de la etiqueta no crece', () => {
    const [enlace] = enlaces(pintar(true));
    expect(enlace.a).toMatch(/\bmin-h-11\b/);
    expect(enlace.a).toMatch(/\bmin-w-11\b/);
    // El fondo oro va en el dibujo de dentro, no en el área que se toca.
    expect(enlace.a).not.toContain('bg-oro-600');
    expect(enlace.dentro).toContain('bg-oro-600');
    // Texto marino: el blanco sobre oro no llega a 4,5:1 (DEC-164).
    expect(enlace.dentro).toContain('text-marino-950');
    expect(enlace.dentro).not.toContain('text-white');
  });

  it('el título se acorta con «…» antes que la etiqueta', () => {
    const html = pintar(true);
    expect(html).toMatch(/<h1 class="[^"]*\bmin-w-0\b[^"]*\btruncate\b/);
    expect(enlaces(html)[0].a).toMatch(/\bshrink-0\b/);
  });

  it('en un formulario (enlacePanel={false}), la etiqueta se ve pero no lleva al panel', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <BarraSuperior titulo="Nuevo punto" jefatura enlacePanel={false} />
      </MemoryRouter>,
    );
    expect(enlaces(html)).toEqual([]);
    expect(html).toContain(T.navegacion.jefatura);
    expect(html).toContain('text-marino-950');
  });

  it('sin jefatura, no hay enlace ni etiqueta', () => {
    const html = pintar(false);
    expect(enlaces(html)).toEqual([]);
    expect(html).not.toContain(T.navegacion.jefatura);
  });
});
