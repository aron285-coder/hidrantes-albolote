import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { archivoHeaders, cabecerasGenerales, TIPO_TESELA } from '../config/cabeceras.ts';
import {
  comprobarPagina,
  comprobarRespuestasMapabase,
  estadoCache,
  rutaTeselaDePrueba,
} from './comprobar-despliegue.ts';

const RAIZ = path.resolve(import.meta.dirname, '..');
const info = JSON.parse(readFileSync(path.join(RAIZ, 'datos', 'mapabase.json'), 'utf8'));

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

// docs/20 RV-71: en línea el mapa pinta con teselas sueltas y la descarga sin conexión baja el PMTiles.
describe('comprobarRespuestasMapabase (RV-71)', () => {
  const ruta = rutaTeselaDePrueba(info);
  const bien = {
    tesela: { ruta, estado: 200, tipo: TIPO_TESELA },
    archivo: { estado: 200, bytes: info.bytes },
  };

  it('la tesela de prueba es una z10 de la carpeta de la versión y está publicada', async () => {
    expect(ruta).toMatch(new RegExp(`^/mapabase/t/${info.version}/10/\\d+/\\d+\\.pbf$`));
    expect(existsSync(path.join(RAIZ, 'public', ruta))).toBe(true);
  });

  it('acepta una tesela MVT (con cualquiera de los dos tipos) y el PMTiles del tamaño esperado', () => {
    expect(comprobarRespuestasMapabase(bien, info.bytes)).toEqual([]);
    const protobuf = { ...bien, tesela: { ...bien.tesela, tipo: 'application/x-protobuf' } };
    expect(comprobarRespuestasMapabase(protobuf, info.bytes)).toEqual([]);
  });

  it('la página de la SPA en lugar de la tesela (200 text/html) es un problema', () => {
    const spa = { ...bien, tesela: { ...bien.tesela, tipo: 'text/html; charset=utf-8' } };
    expect(comprobarRespuestasMapabase(spa, info.bytes)).toEqual([
      expect.stringContaining('Content-Type text/html, no de tesela MVT'),
    ]);
  });

  it('una tesela que falta o un PMTiles de otro tamaño son problemas', () => {
    const mal = { tesela: { ruta, estado: 404, tipo: '' }, archivo: { estado: 200, bytes: 10 } };
    expect(comprobarRespuestasMapabase(mal, info.bytes)).toEqual([
      `${ruta}: estado 404`,
      `el PMTiles entero pesa 10 bytes y datos/mapabase.json dice ${info.bytes}`,
    ]);
  });

  it('el _headers generado da a las teselas un tipo que esta comprobación acepta', () => {
    expect(archivoHeaders({ entorno: 'produccion' })).toContain(`Content-Type: ${TIPO_TESELA}`);
  });
});
