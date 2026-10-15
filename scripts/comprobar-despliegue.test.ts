import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { archivoHeaders, cabecerasGenerales, TIPO_TESELA } from '../config/cabeceras.ts';
import {
  comprobarFunciones,
  comprobarMapabase,
  comprobarPagina,
  comprobarRespuestaFunciones,
  comprobarRespuestasMapabase,
  estadoCache,
  rutaTeselaDePrueba,
} from './comprobar-despliegue.ts';
import { avisoCache } from './comprobar-caches.ts';

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

  // docs/35 RV-410: un secreto equivocado o la Function caída no se esconden tras un aviso de caché.
  it('el aviso dice el estado HTTP cuando no es 200, y nada si sale de la caché', () => {
    expect(avisoCache('/api/x', { cache: 'hit', estado: 200 })).toBeNull();
    expect(avisoCache('/api/x', { cache: 'miss', estado: 200 })).toContain('no sale de la caché');
    expect(avisoCache('/api/x', { cache: null, estado: 401 })).toContain('HTTP 401');
    expect(avisoCache('/api/x', { cache: null, estado: 0 })).toContain('sin respuesta');
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

  // En el primer despliegue de RV-71 la página ya pasaba con el despliegue anterior (misma versión) y
  // la tesela aún salía como la página de la SPA: hay que esperar a que Pages propague, como la página.
  it('mientras Pages propaga, reintenta; cuando llega la tesela, no hay problemas', async () => {
    let pedidas = 0;
    const pedir = async (u: URL) => {
      pedidas++;
      if (u.pathname.endsWith('.pmtiles')) return new Response(new Uint8Array(info.bytes));
      const propagado = pedidas > 4;
      return new Response('x', { headers: { 'content-type': propagado ? TIPO_TESELA : 'text/html; charset=utf-8' } });
    };
    const problemas = await comprobarMapabase('https://x.pages.dev', { info, esperaMs: 0, pedir });
    expect(problemas).toEqual([]);
    expect(pedidas).toBe(6);
  });

  it('si nunca llega, devuelve los problemas del último intento', async () => {
    const pedir = async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } });
    const problemas = await comprobarMapabase('https://x.pages.dev', { info, intentos: 3, esperaMs: 0, pedir });
    expect(problemas).toHaveLength(2);
  });

  it('el _headers generado da a las teselas un tipo que esta comprobación acepta', () => {
    expect(archivoHeaders({ entorno: 'produccion' })).toContain(`Content-Type: ${TIPO_TESELA}`);
  });
});

// docs/37 RV-490 (DEC-210): tras desplegar, las Functions servidas son las del repositorio.
describe('comprobarRespuestaFunciones', () => {
  const buena = { estado: 400, tipo: 'application/json; charset=utf-8', cuerpo: '{"error":"PAYLOAD_INVALIDO"}' };

  it('el 400 PAYLOAD_INVALIDO en JSON de las Functions del repositorio: sin problemas', () => {
    expect(comprobarRespuestaFunciones(buena)).toEqual([]);
  });

  it('otro estado, HTML u otro cuerpo: problema', () => {
    expect(comprobarRespuestaFunciones({ ...buena, estado: 200 })).toHaveLength(1);
    expect(comprobarRespuestaFunciones({ ...buena, estado: 503 })).toHaveLength(1);
    expect(comprobarRespuestaFunciones({ ...buena, tipo: 'text/html', cuerpo: '<!doctype html>' })).toHaveLength(2);
    expect(comprobarRespuestaFunciones({ ...buena, cuerpo: '{"error":"OTRO"}' })).toHaveLength(1);
    expect(comprobarRespuestaFunciones({ ...buena, cuerpo: '{"error":"PAYLOAD_INVALIDO","x":1}' })).toHaveLength(1);
  });

  it('comprobarFunciones manda {} por POST sin Origin y reintenta hasta que responde bien', async () => {
    const pedidas: { url: string; init?: RequestInit }[] = [];
    let n = 0;
    const pedir = (async (url: URL, init?: RequestInit) => {
      pedidas.push({ url: String(url), init });
      n++;
      return n === 1
        ? new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })
        : new Response(buena.cuerpo, { status: 400, headers: { 'content-type': buena.tipo } });
    }) as typeof fetch;
    expect(await comprobarFunciones('https://app.example', { pedir, esperaMs: 0 })).toEqual([]);
    expect(pedidas).toHaveLength(2);
    expect(pedidas[0]!.url).toBe('https://app.example/api/verificar-codigo');
    expect(pedidas[0]!.init?.method).toBe('POST');
    expect(pedidas[0]!.init?.body).toBe('{}');
    expect(new Headers(pedidas[0]!.init?.headers).has('origin')).toBe(false);
  });

  it('comprobarFunciones devuelve los problemas del último intento si nunca responde bien', async () => {
    const pedir = (async () => {
      throw new Error('sin red');
    }) as typeof fetch;
    expect(await comprobarFunciones('https://app.example', { pedir, esperaMs: 0, intentos: 2 })).toEqual([
      'verificar-codigo no responde: sin red',
    ]);
  });
});
