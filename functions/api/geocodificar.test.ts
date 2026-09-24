// Números de portal con CartoCiudad (FR-73, TR-76, TR-118, DEC-092, docs/18 GM-04 C). Nunca anónima,
// nunca más de 5 s, nunca fuera de la zona, y la consulta no se guarda en claro en ningún sitio.

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Env } from '../_lib/comun.ts';
import { RECUADRO_ZONA } from '../_lib/zona.ts';
import { MAX_RESULTADOS, TIEMPO_MAXIMO_MS, claveCache, etiquetaDe, onRequestPost } from './geocodificar.ts';

const ENV = {
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-de-servicio', // detectar-secretos:permitir (valor de prueba)
  SAL_IP: 'sal',
  NOMINATIM_USER_AGENT: 'hidrantes-albolote/1.0 (pruebas)',
} as Env;

const ORIGEN = 'https://hidrantes-albolote-staging.pages.dev';
const peticion = (cuerpo: unknown, cabeceras: Record<string, string> = {}) =>
  new Request(`${ORIGEN}/api/geocodificar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabeceras },
    body: JSON.stringify(cuerpo),
  });
const responder = (request: Request) => onRequestPost({ request, env: ENV });

const PORTAL = {
  id: '01.18.G18_180030276266',
  type: 'portal',
  address: 'CALLE REAL 12, Albolote',
  muni: 'Albolote',
  muniCode: '18003',
  tip_via: 'CALLE',
  portalNumber: 12,
  lat: 37.231929,
  lng: -3.657528,
};
const CALLE_SIN_COORDENADAS = {
  id: '180030000353',
  type: 'callejero',
  address: 'CALLE REAL, Albolote',
  muni: 'Albolote',
  muniCode: '18003',
  lat: 0,
  lng: 0,
};
const LEJOS = { ...PORTAL, id: 'lejos', address: 'CALLE REAL 12, Madrid', lat: 40.4168, lng: -3.7038 };

interface Red {
  tokenValido?: boolean;
  admin?: boolean;
  candidatos?: unknown[] | Error;
  find?: unknown;
}

function fingirRed(red: Red) {
  const llamadas: string[] = [];
  const espia = vi.spyOn(globalThis, 'fetch').mockImplementation((entrada) => {
    const url = String(entrada instanceof URL ? entrada.href : entrada instanceof Request ? entrada.url : entrada);
    llamadas.push(url);
    if (url.includes('fn_listar_puntos')) {
      return Promise.resolve(
        red.tokenValido === false
          ? new Response(JSON.stringify({ code: 'P0001', message: 'TOKEN_INVALIDO: no' }), { status: 400 })
          : new Response('{}'),
      );
    }
    if (url.includes('fn_es_admin')) return Promise.resolve(new Response(String(red.admin ?? true)));
    if (url.includes('/candidates?')) {
      const c = red.candidatos ?? [PORTAL];
      return c instanceof Error ? Promise.reject(c) : Promise.resolve(new Response(JSON.stringify(c)));
    }
    if (url.includes('/find?')) {
      return Promise.resolve(
        new Response(
          JSON.stringify(
            red.find ?? { ...CALLE_SIN_COORDENADAS, address: 'REAL', tip_via: 'CALLE', lat: 37.23299, lng: -3.6584 },
          ),
        ),
      );
    }
    return Promise.resolve(new Response('null', { status: 404 }));
  });
  return { espia, llamadas };
}

/** `caches.default` de Cloudflare, en memoria. */
function fingirCache() {
  const guardado = new Map<string, string>();
  vi.stubGlobal('caches', {
    default: {
      match: async (r: Request) => (guardado.has(r.url) ? new Response(guardado.get(r.url)) : undefined),
      put: async (r: Request, respuesta: Response) => void guardado.set(r.url, await respuesta.text()),
    },
  });
  return guardado;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('POST /api/geocodificar', () => {
  it('sin token ni sesión, 401 y no se pregunta a CartoCiudad', async () => {
    const { llamadas } = fingirRed({});
    const r = await responder(peticion({ q: 'calle real 12' }));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: 'TOKEN_INVALIDO' });
    expect(llamadas.some((u) => u.includes('cartociudad'))).toBe(false);
  });

  it('con un token que no vale, o una sesión que no es de jefatura, 401', async () => {
    fingirRed({ tokenValido: false, admin: false });
    expect((await responder(peticion({ token: 'x', q: 'calle real 12' }))).status).toBe(401);
    expect((await responder(peticion({ q: 'calle real 12' }, { Authorization: 'Bearer aaa.bbb.ccc' }))).status).toBe(
      401,
    );
  });

  it('q de menos de 3 o más de 120 caracteres: 400', async () => {
    const { llamadas } = fingirRed({});
    for (const q of ['ab', '  ab  ', 'x'.repeat(121), 12]) {
      const r = await responder(peticion({ token: 't', q }));
      expect(r.status, String(q)).toBe(400);
      expect(await r.json()).toEqual({ error: 'PAYLOAD_INVALIDO' });
    }
    expect(llamadas.some((u) => u.includes('cartociudad'))).toBe(false);
  });

  it('devuelve el portal, con la fuente, para un voluntario y para jefatura', async () => {
    const { llamadas } = fingirRed({});
    for (const [cuerpo, cabeceras] of [
      [{ token: 't', q: 'calle real 12' }, {}],
      [{ q: 'calle real 12' }, { Authorization: 'Bearer aaa.bbb.ccc' }],
    ] as const) {
      const r = await responder(peticion(cuerpo, cabeceras));
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({
        resultados: [
          {
            etiqueta: 'Calle Real, 12, Albolote',
            tipo: 'portal',
            lat: 37.231929,
            lng: -3.657528,
            municipio: 'albolote',
          },
        ],
        fuente: 'CartoCiudad (IGN/CNIG)',
      });
    }
    const url = new URL(llamadas.find((u) => u.includes('/candidates?'))!);
    expect(url.searchParams.get('q')).toBe('calle real 12');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('municipio_filter')).toBe('Albolote,Calicasas');
    expect(url.searchParams.get('no_process')).toContain('carretera');
  });

  it('manda el User-Agent identificable y un tiempo máximo de 5 s (TR-76, TR-118)', async () => {
    const { espia } = fingirRed({});
    await responder(peticion({ token: 't', q: 'calle real 12' }));
    const llamada = espia.mock.calls.find(([u]) => String(u).includes('/candidates?'))!;
    const init = llamada[1] as RequestInit;
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(ENV.NOMINATIM_USER_AGENT);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(TIEMPO_MAXIMO_MS).toBe(5000);
  });

  it('filtra lo que queda fuera del recuadro de la zona con 2 km de margen', async () => {
    fingirRed({ candidatos: [LEJOS, PORTAL] });
    const r = await responder(peticion({ token: 't', q: 'calle real 12' }));
    const { resultados } = (await r.json()) as { resultados: { etiqueta: string }[] };
    expect(resultados.map((x) => x.etiqueta)).toEqual(['Calle Real, 12, Albolote']);
  });

  it('usa find cuando un candidato llega sin coordenadas', async () => {
    const { llamadas } = fingirRed({ candidatos: [CALLE_SIN_COORDENADAS] });
    const r = await responder(peticion({ token: 't', q: 'calle real' }));
    expect(await r.json()).toMatchObject({
      resultados: [{ etiqueta: 'Calle Real, Albolote', tipo: 'calle', lat: 37.23299, lng: -3.6584 }],
    });
    const find = new URL(llamadas.find((u) => u.includes('/find?'))!);
    expect(find.searchParams.get('id')).toBe('180030000353');
    expect(find.searchParams.get('type')).toBe('callejero');
  });

  it('CartoCiudad caído o fuera de tiempo: 503 SIN_SERVIDOR', async () => {
    for (const fallo of [new DOMException('tiempo', 'TimeoutError'), new TypeError('sin red')]) {
      fingirRed({ candidatos: fallo });
      const r = await responder(peticion({ token: 't', q: 'calle real 12' }));
      expect(r.status).toBe(503);
      expect(await r.json()).toEqual({ error: 'SIN_SERVIDOR' });
      vi.restoreAllMocks();
    }
  });

  it('la segunda petición igual sale de la caché, y la clave no contiene el texto', async () => {
    const guardado = fingirCache();
    const { llamadas } = fingirRed({});
    await responder(peticion({ token: 't', q: 'Calle Real 12' }));
    const r = await responder(peticion({ token: 't', q: 'calle  real 12' }));
    expect(r.status).toBe(200);
    expect(llamadas.filter((u) => u.includes('/candidates?'))).toHaveLength(1);
    const [clave] = [...guardado.keys()];
    expect(clave).toMatch(new RegExp(`^${ORIGEN}/__cache/geocodificar\\?q=[0-9a-f]{64}$`));
    expect(clave).not.toMatch(/real/i);
    expect(clave).toBe(await claveCache(ORIGEN, 'calle real 12'));
  });

  it('sin resultados no se guarda en la caché', async () => {
    const guardado = fingirCache();
    fingirRed({ candidatos: [] });
    const r = await responder(peticion({ token: 't', q: 'calle que no existe 3' }));
    expect(await r.json()).toEqual({ resultados: [], fuente: 'CartoCiudad (IGN/CNIG)' });
    expect(guardado.size).toBe(0);
  });

  it('como mucho 5 resultados', async () => {
    const muchos = Array.from({ length: 10 }, (_, i) => ({
      ...PORTAL,
      id: `p${i}`,
      address: `CALLE REAL ${i + 1}, Albolote`,
      portalNumber: i + 1,
    }));
    fingirRed({ candidatos: muchos });
    const r = await responder(peticion({ token: 't', q: 'calle real' }));
    const { resultados } = (await r.json()) as { resultados: unknown[] };
    expect(resultados).toHaveLength(MAX_RESULTADOS);
    expect(MAX_RESULTADOS).toBe(5);
  });

  it('la consulta no se escribe en la consola', async () => {
    const consola = ['log', 'info', 'warn', 'error', 'debug'].map((m) =>
      vi.spyOn(console, m as 'log').mockImplementation(() => {}),
    );
    fingirRed({ candidatos: new TypeError('sin red') });
    await responder(peticion({ token: 't', q: 'calle secreta 7' }));
    for (const c of consola) expect(c).not.toHaveBeenCalled();
  });
});

describe('etiquetaDe', () => {
  it('pasa a mayúsculas y minúsculas y separa el número', () => {
    expect(etiquetaDe(PORTAL)).toBe('Calle Real, 12, Albolote');
    expect(etiquetaDe({ type: 'portal', address: 'AVENIDA ANDALUCIA (DE) 31, Calicasas', portalNumber: 31 })).toBe(
      'Avenida Andalucia (de), 31, Calicasas',
    );
    expect(etiquetaDe({ type: 'toponimo', address: 'Estación de metro Juncaril (Albolote)', muni: 'Albolote' })).toBe(
      'Estación de metro Juncaril (Albolote)',
    );
  });
});

describe('recuadro', () => {
  it('es el de datos/meta.json', () => {
    const meta = JSON.parse(readFileSync('datos/meta.json', 'utf8')) as { recuadro: number[] };
    expect([...RECUADRO_ZONA]).toEqual(meta.recuadro);
  });
});
