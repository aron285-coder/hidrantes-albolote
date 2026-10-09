// docs/33 RV-313 (U4): el aviso de versión nueva va abajo, sobre la navegación, con mayúscula y el
// botón «Actualizar»; no en la pila de arriba (empujaba el contenido y tapaba el buscador). En un
// formulario no ofrece actualizar: dice que se actualizará al terminar.
// Vitest corre en Node, sin DOM: se pinta a HTML con react-dom/server.

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({ hay: true }));
vi.mock('@/hooks/version', () => ({ useVersionNueva: () => estado.hay }));
vi.mock('@/hooks/cola', () => ({ useCola: () => [] }));
vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => undefined }));

const { AvisoVersion } = await import('./AvisoVersion');
const { debeActualizarAlVolver } = await import('@/lib/pwa');
const { T } = await import('@/lib/textos');

const pintar = (ruta: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[ruta]}>
      <AvisoVersion />
    </MemoryRouter>,
  );

/** El aviso de versión, con sus atributos y lo de dentro. */
const aviso = (html: string) => /<div [^>]*data-testid="aviso-version"[^>]*>(.*?)<\/div>/s.exec(html);

describe('aviso de versión nueva (RV-313)', () => {
  beforeEach(() => {
    estado.hay = true;
  });

  it('en el mapa: «Hay una versión nueva» con mayúscula y el botón «Actualizar»', () => {
    const html = pintar('/');
    const a = aviso(html);
    expect(a, html).not.toBeNull();
    expect(a![1]).toContain(T.version.hay);
    expect(T.version.hay).toMatch(/^Hay /);
    expect(a![1]).toMatch(new RegExp(`<button[^>]*>${T.version.actualizar}</button>`));
    expect(html).not.toContain(T.ajustes.versionNueva);
  });

  it('va abajo, fijo y por encima de la navegación: no empuja nada', () => {
    const atributos = aviso(pintar('/'))![0];
    expect(atributos).toMatch(/\bfixed\b/);
    expect(atributos).toMatch(/bottom-/);
  });

  it('en un formulario no ofrece actualizar: se actualizará al terminar', () => {
    const a = aviso(pintar('/proponer/alta'));
    expect(a).not.toBeNull();
    expect(a![1]).toContain(T.version.alTerminar);
    expect(a![1]).not.toMatch(/<button/);
  });

  it('sin versión nueva, nada', () => {
    estado.hay = false;
    expect(aviso(pintar('/'))).toBeNull();
  });

  it('en el panel sigue arriba, en la pila: abajo taparía Aprobar y Rechazar', () => {
    const html = pintar('/admin');
    expect(aviso(html)).toBeNull();
    expect(html).toContain(T.version.hay);
    expect(html).toMatch(new RegExp(`<button[^>]*>${T.version.actualizar}</button>`));
  });

  // Con aria-live y no role=status: no se confunde con los demás «status» de la pantalla (la banda de pruebas).
  it('el lector de pantalla lo oye por una región que está siempre montada', () => {
    estado.hay = false;
    expect(pintar('/')).toMatch(/<p aria-live="polite" class="sr-only" data-testid="anuncio-version"><\/p>/);
    estado.hay = true;
    expect(pintar('/')).toMatch(
      new RegExp(`<p aria-live="polite" class="sr-only" data-testid="anuncio-version">${T.version.hay}</p>`),
    );
    expect(pintar('/proponer/alta')).toMatch(
      new RegExp(`<p aria-live="polite" class="sr-only" data-testid="anuncio-version">${T.version.alTerminar}</p>`),
    );
  });
});

describe('se actualiza al volver al mapa desde un formulario (RV-313)', () => {
  it('al llegar al mapa después de un formulario, sí', () => {
    expect(debeActualizarAlVolver(true, '/')).toBe(true);
  });
  it('en la pantalla de «enviado» o en otra que no sea el mapa, todavía no', () => {
    expect(debeActualizarAlVolver(true, '/proponer/hecho')).toBe(false);
    expect(debeActualizarAlVolver(true, '/mis-propuestas')).toBe(false);
  });
  it('si no se venía de un formulario, lo decide el voluntario con el botón', () => {
    expect(debeActualizarAlVolver(false, '/')).toBe(false);
  });
});
