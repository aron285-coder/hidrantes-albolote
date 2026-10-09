// docs/31 RV-157: con un formulario a medias, ni una notificación ni la versión nueva se lo llevan
// por delante: la app pregunta antes de salir.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { enFormulario, escucharAvisosPush } from './aviso-formulario';

afterEach(() => vi.unstubAllGlobals());

describe('enFormulario', () => {
  it('es un formulario lo que cuelga de /proponer', () => {
    expect(enFormulario('/proponer/alta')).toBe(true);
    expect(enFormulario('/proponer/revision')).toBe(true);
    expect(enFormulario('/')).toBe(false);
    expect(enFormulario('/mis-propuestas')).toBe(false);
  });

  it('la pantalla de resultado no es un formulario (docs/32 RV-240)', () => {
    expect(enFormulario('/proponer/hecho')).toBe(false);
    expect(enFormulario('/proponer/hecho/')).toBe(false);
  });
});

describe('escucharAvisosPush', () => {
  function conServiceWorker() {
    const oyentes = new Set<(e: { data: unknown }) => void>();
    vi.stubGlobal('navigator', {
      serviceWorker: {
        addEventListener: (_t: string, f: (e: { data: unknown }) => void) => oyentes.add(f),
        removeEventListener: (_t: string, f: (e: { data: unknown }) => void) => oyentes.delete(f),
      },
    });
    return (data: unknown) => oyentes.forEach((f) => f({ data }));
  }

  it('pasa la ruta del aviso que manda el Service Worker', () => {
    const mandar = conServiceWorker();
    const f = vi.fn();
    const quitar = escucharAvisosPush(f);
    mandar({ tipo: 'aviso_push', url: '/mis-propuestas' });
    expect(f).toHaveBeenCalledWith('/mis-propuestas');
    quitar();
    mandar({ tipo: 'aviso_push', url: '/mis-propuestas' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('ignora otros mensajes y rutas que no son de la app', () => {
    const mandar = conServiceWorker();
    const f = vi.fn();
    escucharAvisosPush(f);
    mandar({ tipo: 'otro', url: '/x' });
    mandar({ tipo: 'aviso_push', url: 'https://otro.example/x' });
    mandar({ tipo: 'aviso_push', url: '//otro.example/x' });
    mandar(null);
    expect(f).not.toHaveBeenCalled();
  });

  it('sin Service Worker no hace nada y no falla', () => {
    vi.stubGlobal('navigator', {});
    expect(() => escucharAvisosPush(vi.fn())()).not.toThrow();
  });
});
