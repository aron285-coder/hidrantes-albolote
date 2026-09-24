import { describe, expect, it } from 'vitest';
import { cabecerasGenerales } from '../config/cabeceras.ts';
import { comprobarPagina, estadoCache } from './comprobar-despliegue.ts';

const html = (robots: boolean) =>
  `<head><meta name="version" content="1.2.3">${robots ? '<meta name="robots" content="noindex, nofollow">' : ''}</head>`;

describe('comprobarPagina', () => {
  it('acepta lo que genera config/cabeceras.ts en staging y en producción', () => {
    const staging = new Headers(cabecerasGenerales({ entorno: 'staging', supabaseUrl: 'https://x.supabase.co' }));
    expect(
      comprobarPagina(
        { estado: 200, cabeceras: staging, html: html(true), robots: 'User-agent: *\nDisallow: /\n' },
        'staging',
        '1.2.3',
      ),
    ).toEqual([]);
    const prod = new Headers(cabecerasGenerales({ entorno: 'produccion' }));
    expect(
      comprobarPagina(
        { estado: 200, cabeceras: prod, html: html(false), robots: 'User-agent: *\nAllow: /\n' },
        'produccion',
        '1.2.3',
      ),
    ).toEqual([]);
  });

  it('detecta cabeceras ausentes, versión vieja y staging indexable', () => {
    const p = comprobarPagina(
      { estado: 200, cabeceras: new Headers(), html: html(false), robots: '' },
      'staging',
      '9.9.9',
    );
    expect(p).toEqual(
      expect.arrayContaining([
        'no sirve la versión 9.9.9',
        'falta Content-Security-Policy',
        'staging no está marcado noindex / Disallow',
      ]),
    );
  });
});

// docs/19 RV-63: la caché de las Functions se comprueba con dos peticiones iguales.
describe('estadoCache (RV-63)', () => {
  it('hit en la segunda es que funciona; miss, que no; sin cabecera, que no se sabe', () => {
    expect(estadoCache('hit')).toBe('funciona');
    expect(estadoCache('miss')).toBe('no_funciona');
    expect(estadoCache(null)).toBe('sin_dato');
  });
});
