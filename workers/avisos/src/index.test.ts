// El Worker de los avisos (docs/19 RV-52): repite mientras queden, un destino no para al otro y
// nunca pasa de 20 llamadas, por debajo de las 50 subpeticiones del plan gratuito.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Env, MAX_VUELTAS, despachar, secretoDe } from './despachar.ts';
import trabajador, * as modulo from './index.ts';

const PROD = 'https://hidrantes-albolote.pages.dev';
const STAGING = 'https://hidrantes-albolote-staging.pages.dev';
const ENV: Env = {
  DESTINOS: `${PROD},${STAGING}`,
  VIGILANCIA_SECRETO_PROD: 'secreto-prod', // detectar-secretos:permitir (valor de prueba)
  VIGILANCIA_SECRETO_STAGING: 'secreto-staging', // detectar-secretos:permitir (valor de prueba)
};

type Respuesta = Response | Error | ((n: number) => Response);

/** fetch simulado por destino: cada llamada a un destino devuelve la siguiente respuesta de su lista. */
function fetchSimulado(porDestino: Record<string, Respuesta>) {
  const llamadas: { url: string; secreto: string | null }[] = [];
  const cuenta = new Map<string, number>();
  const f = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    const origen = new URL(url).origin;
    llamadas.push({ url, secreto: new Headers(init?.headers).get('X-Vigilancia') });
    const n = (cuenta.get(origen) ?? 0) + 1;
    cuenta.set(origen, n);
    const r = porDestino[origen];
    if (r instanceof Error) throw r;
    if (typeof r === 'function') return r(n);
    return (r ?? new Response('{}', { status: 404 })).clone();
  });
  return { f: f as unknown as typeof fetch, llamadas };
}

const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status });

afterEach(() => vi.restoreAllMocks());

describe('despachar (RV-52)', () => {
  it('repite mientras la respuesta traiga quedan, y para en 10', async () => {
    const { f, llamadas } = fetchSimulado({
      [PROD]: () => json({ enviadas: 20, quedan: true }),
      [STAGING]: (n) => json({ enviadas: n === 3 ? 5 : 20, quedan: n < 3 }),
    });
    const r = await despachar(ENV, f);
    expect(r[0]).toMatchObject({ destino: PROD, llamadas: MAX_VUELTAS, enviadas: 200, salida: 'ok' });
    expect(r[1]).toMatchObject({ destino: STAGING, llamadas: 3, enviadas: 45, salida: 'ok' });
    expect(llamadas.every((l) => l.url.endsWith('/api/push'))).toBe(true);
  });

  it('nunca más de 20 llamadas', async () => {
    const { f, llamadas } = fetchSimulado({
      [PROD]: () => json({ quedan: true }),
      [STAGING]: () => json({ quedan: true }),
    });
    await despachar(ENV, f);
    expect(llamadas).toHaveLength(20);
  });

  it('un 401 en PROD no impide STAGING, y se anota sin datos', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { f } = fetchSimulado({
      [PROD]: () => json({ error: 'NO_AUTORIZADO' }, 401),
      [STAGING]: () => json({ enviadas: 2, quedan: false }),
    });
    const r = await despachar(ENV, f);
    expect(r.map((x) => x.salida)).toEqual(['no_autorizado', 'ok']);
    expect(r[1]!.enviadas).toBe(2);
    expect(aviso).toHaveBeenCalledWith('avisos: hidrantes-albolote.pages.dev · no_autorizado');
    expect(JSON.stringify(aviso.mock.calls)).not.toContain('secreto');
  });

  it('un 404 (el destino aún no tiene la versión) tampoco para al otro', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { f } = fetchSimulado({ [PROD]: () => new Response('', { status: 404 }), [STAGING]: () => json({}) });
    expect((await despachar(ENV, f)).map((x) => x.salida)).toEqual(['no_encontrado', 'ok']);
  });

  it('un timeout se anota y sigue', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { f } = fetchSimulado({
      [PROD]: new DOMException('tiempo', 'TimeoutError'),
      [STAGING]: () => json({ enviadas: 1 }),
    });
    const r = await despachar(ENV, f);
    expect(r.map((x) => x.salida)).toEqual(['fallo', 'ok']);
  });

  it('envía la cabecera X-Vigilancia con el secreto de cada destino', async () => {
    const { f, llamadas } = fetchSimulado({ [PROD]: () => json({}), [STAGING]: () => json({}) });
    await despachar(ENV, f);
    expect(llamadas).toEqual([
      { url: `${PROD}/api/push`, secreto: 'secreto-prod' },
      { url: `${STAGING}/api/push`, secreto: 'secreto-staging' },
    ]);
  });

  it('sin el secreto de un destino, no lo llama y sigue', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { f, llamadas } = fetchSimulado({ [STAGING]: () => json({}) });
    const r = await despachar({ ...ENV, VIGILANCIA_SECRETO_PROD: undefined }, f);
    expect(r.map((x) => x.salida)).toEqual(['sin_secreto', 'ok']);
    expect(llamadas).toHaveLength(1);
  });

  it('nunca lanza fuera de despachar', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { f } = fetchSimulado({ [PROD]: () => new Response('no es json'), [STAGING]: () => json({}) });
    await expect(despachar(ENV, f)).resolves.toHaveLength(2);
    await expect(despachar({ DESTINOS: 'no-es-una-url' }, f)).resolves.toBeDefined();
  });

  it('producción usa su secreto; staging o local, el de staging', () => {
    expect(secretoDe(PROD, ENV)).toBe('secreto-prod');
    expect(secretoDe(STAGING, ENV)).toBe('secreto-staging');
    expect(secretoDe('http://127.0.0.1:8788', ENV)).toBe('secreto-staging');
  });
});

describe('el Worker', () => {
  // Una exportación con nombre que no sea un manejador impide arrancar al runtime de Workers: pasó
  // con MAX_VUELTAS y lo cazó la prueba de integración de ci-sql.
  it('index.ts solo exporta el manejador por defecto', () => {
    expect(Object.keys(modulo)).toEqual(['default']);
  });

  it('fetch() devuelve 404: sin superficie HTTP', async () => {
    expect((await trabajador.fetch()).status).toBe(404);
  });

  it('scheduled() despacha dentro de waitUntil', async () => {
    const promesas: Promise<unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({})),
    );
    await trabajador.scheduled({}, ENV, { waitUntil: (p) => promesas.push(p) });
    expect(promesas).toHaveLength(1);
    await expect(promesas[0]).resolves.toHaveLength(2);
    vi.unstubAllGlobals();
  });
});
