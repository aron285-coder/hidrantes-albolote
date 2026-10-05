// docs/24 RV-104: Granada y Barcelona con su foto de referencia encima del nombre (FR-20); «Otro»
// sin foto. Mientras el desarrollador no ponga las fotos, el botón se ve como antes: sin <img> roto.
// docs/29 RV-121 (DEC-170): «Directo» entra entre Granada y Otro, también con su foto.
// Vitest corre en Node: se pinta a HTML con react-dom/server.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { SelectorRacor } from './Campos';
import { ORDEN_RACORES, URL_FOTO_RACOR, marcarFotoRacor, olvidarFotosRacor } from '@/lib/racores';
import { T } from '@/lib/textos';
import type { Racor } from '@/tipos/punto';

/** Cada botón del selector: su texto, si está marcado y la etiqueta <img> que lleve dentro. */
function botones(html: string) {
  return [...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)].map(([, atributos, dentro]) => ({
    texto: dentro.replace(/<[^>]+>/g, '').trim(),
    marcado: /aria-checked="true"/.test(atributos),
    img: /<img\b[^>]*>/.exec(dentro)?.[0] ?? null,
  }));
}

const pintar = (valor?: Racor) => botones(renderToStaticMarkup(<SelectorRacor valor={valor} alCambiar={() => {}} />));

beforeEach(() => olvidarFotosRacor());

describe('foto de referencia del racor (RV-104)', () => {
  it('sin las fotos en el servidor no hay <img> en ningún botón y el nombre sigue', () => {
    marcarFotoRacor('granada', 'falta');
    marcarFotoRacor('barcelona', 'falta');
    marcarFotoRacor('directo', 'falta');
    const b = pintar('granada');
    expect(b.map((x) => x.texto)).toEqual([
      T.formulario.barcelona,
      T.formulario.granada,
      T.formulario.directo,
      T.formulario.otro,
    ]);
    expect(b.every((x) => x.img === null)).toBe(true);
    expect(b[1].marcado).toBe(true);
  });

  it('antes de saber si están, la imagen se pide pero no se ve (nunca un icono roto)', () => {
    const [, granada, directo] = pintar();
    expect(granada.img).toContain(`src="${URL_FOTO_RACOR.granada}"`);
    expect(granada.img).toMatch(/class="[^"]*\bhidden\b/);
    expect(directo.img).toContain(`src="${URL_FOTO_RACOR.directo}"`);
    expect(directo.img).toMatch(/class="[^"]*\bhidden\b/);
  });

  it('con la foto, <img> de 48 × 48 con alt vacío dentro del botón, y la selección no cambia', () => {
    marcarFotoRacor('granada', 'ok');
    marcarFotoRacor('barcelona', 'ok');
    marcarFotoRacor('directo', 'ok');
    for (const valor of [undefined, 'barcelona'] as const) {
      const [barcelona, granada, directo, otro] = pintar(valor);
      for (const x of [granada, barcelona, directo]) {
        expect(x.img).toContain('alt=""');
        expect(x.img).toContain('width="48"');
        expect(x.img).toContain('height="48"');
        expect(x.img).not.toMatch(/\bhidden\b/);
      }
      expect(otro.img).toBeNull();
      expect([granada.marcado, barcelona.marcado, directo.marcado, otro.marcado]).toEqual([
        false,
        valor === 'barcelona',
        false,
        false,
      ]);
      expect(granada.texto).toBe(T.formulario.granada);
    }
  });

  // docs/25 RV-112 (DEC-163) y docs/29 RV-121 (DEC-170): «Tipo de enganche», con Barcelona,
  // Granada, Directo y Otro en este orden.
  it('el grupo se llama "Tipo de enganche" y las opciones van Barcelona, Granada, Directo, Otro', () => {
    const html = renderToStaticMarkup(<SelectorRacor alCambiar={() => {}} />);
    expect(html).toContain('role="radiogroup" aria-label="Tipo de enganche"');
    expect(botones(html).map((x) => x.texto)).toEqual(['Barcelona', 'Granada', 'Directo', 'Otro']);
  });

  it('las cuatro tarjetas van en una sola fila a cualquier ancho, también a 360 px (RV-121)', () => {
    const html = renderToStaticMarkup(<SelectorRacor alCambiar={() => {}} />);
    const grupo = (/<div role="radiogroup"[^>]*class="([^"]*)"/.exec(html)?.[1] ?? '').split(/\s+/);
    expect(grupo).toContain('grid-cols-4');
    // Nada que la parta en dos filas en algún ancho.
    expect(grupo.filter((c) => /grid-cols-/.test(c))).toEqual(['grid-cols-4']);
  });

  it('la foto pasa de 48 a 40 px por debajo de 400 px de ancho (RV-121)', () => {
    marcarFotoRacor('granada', 'ok');
    const [, granada] = pintar();
    const clase = (/class="([^"]*)"/.exec(granada.img ?? '')?.[1] ?? '').split(/\s+/);
    expect(clase).toEqual(expect.arrayContaining(['size-10', 'min-[400px]:size-12']));
  });

  it('elegir Directo devuelve racor "directo" (RV-121)', () => {
    const elegidos: Racor[] = [];
    // Sin DOM en vitest: se llama al componente y se pulsa la tarjeta cuyo texto es «Directo».
    const arbol = SelectorRacor({ alCambiar: (r) => elegidos.push(r) });
    const tarjetas = arbol.props.children as { props: { onClick: () => void; children: unknown[] } }[];
    const directo = tarjetas.find((t) => t.props.children.includes(T.formulario.directo));
    expect(directo, 'no hay tarjeta «Directo»').toBeDefined();
    directo!.props.onClick();
    expect(elegidos).toEqual(['directo']);
  });

  // Una copia de la lista que se quede en tres opciones enseñaría «Barcelona» en un <select> cuyo
  // valor es «directo» (la primera opción), y jefatura lo aprobaría sin saberlo.
  it('ningún selector de enganche lleva su propia lista: todos usan ORDEN_RACORES (RV-121)', () => {
    expect(ORDEN_RACORES).toEqual(['barcelona', 'granada', 'directo', 'otro']);
    const raiz = path.resolve(import.meta.dirname, '../..');
    const copias = (readdirSync(raiz, { recursive: true }) as string[])
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .map((f) => f.replaceAll('\\', '/'))
      .filter(
        (f) => f !== 'lib/racores.ts' && /\[\s*'barcelona',\s*'granada'/.test(readFileSync(path.join(raiz, f), 'utf8')),
      );
    // dialogos.tsx (Editar del inventario) es de la sesión de panel: lo cambia EditarPunto (RV-124).
    expect(copias.filter((f) => f !== 'componentes/panel/dialogos.tsx')).toEqual([]);
  });

  it('las fotos van en public/racores; la de Directo también, aunque aún no esté', () => {
    expect(URL_FOTO_RACOR).toEqual({
      granada: '/racores/granada.webp',
      barcelona: '/racores/barcelona.webp',
      directo: '/racores/directo.webp',
    });
  });

  it('entran en el precache del Service Worker, para verlas sin cobertura', () => {
    const config = readFileSync(path.resolve(import.meta.dirname, '../../../vite.config.ts'), 'utf8');
    const patron = /globPatterns:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? '';
    expect(patron).toMatch(/webp/);
  });
});
