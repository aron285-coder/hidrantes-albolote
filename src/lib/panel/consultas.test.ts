// Lecturas del panel (05 §5): siempre un Resultado, nunca una excepción, y la diferencia entre
// "el servidor ha respondido que no" y "el servidor no está" (FR-168), que es la que enciende el
// aviso de jefatura.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { almacenEnMemoria, respuesta } from '../pruebas';

const sesion = { data: { session: { access_token: 'jwt-de-jefatura' } } };
let hayCliente = true;
const cliente = { auth: { getSession: vi.fn(async () => sesion) } };
vi.mock('../supabase', () => ({ supabase: () => (hayCliente ? cliente : null) }));

const { SIN_SERVIDOR } = await import('../api');
const { contar, funcion, jwt, leer, leerLista, leerPagina } = await import('./consultas');
const { _reiniciar, estadoConexion } = await import('../conexion');

const devuelve = (r: unknown) => () => Promise.resolve(r) as never;

beforeEach(() => {
  almacenEnMemoria();
  hayCliente = true;
  _reiniciar();
});
afterEach(() => vi.unstubAllGlobals());

describe('leer y leerLista', () => {
  it('datos buenos, servidor vivo', async () => {
    const r = await leer<{ id: string }[]>(devuelve({ data: [{ id: 'a' }], error: null, status: 200 }));
    expect(r).toEqual({ ok: true, datos: [{ id: 'a' }] });
    expect(estadoConexion()).toBe('bien');
  });

  it('un 4xx es un fallo del panel, no una caída', async () => {
    const r = await leer(devuelve({ data: null, error: { message: 'no' }, status: 400 }));
    expect(r).toEqual({ ok: false, codigo: 'ERROR_INTERNO' });
    expect(estadoConexion()).toBe('bien');
  });

  it('un 500, un 0 o una excepción encienden el aviso', async () => {
    expect(await leer(devuelve({ data: null, error: { message: 'x' }, status: 500 }))).toEqual({
      ok: false,
      codigo: SIN_SERVIDOR,
    });
    expect(estadoConexion()).toBe('sin_servidor');

    _reiniciar();
    expect(
      await leer(() => {
        throw new TypeError('Failed to fetch');
      }),
    ).toEqual({ ok: false, codigo: SIN_SERVIDOR });
    expect(estadoConexion()).toBe('sin_servidor');
  });

  it('si donde esperábamos una lista llega otra cosa, es un fallo y no una lista vacía (TR-106)', async () => {
    expect(await leerLista(devuelve({ data: { total: 3 }, error: null, status: 200 }))).toEqual({
      ok: false,
      codigo: 'ERROR_INTERNO',
    });
    expect(await leerLista(devuelve({ data: [], error: null, status: 200 }))).toEqual({ ok: true, datos: [] });
  });

  it('sin cliente no se lanza: se responde que no hay servidor', async () => {
    hayCliente = false;
    expect(await leer(devuelve({ data: [], error: null, status: 200 }))).toEqual({ ok: false, codigo: SIN_SERVIDOR });
  });
});

describe('contar (contador de pendientes, FR-110)', () => {
  it('devuelve el count de PostgREST', async () => {
    expect(await contar(devuelve({ data: null, error: null, status: 200, count: 7 }))).toEqual({ ok: true, datos: 7 });
    expect(await contar(devuelve({ data: null, error: null, status: 200, count: 0 }))).toEqual({ ok: true, datos: 0 });
  });

  it('sin count (cabecera Content-Range no expuesta) no se inventa un cero', async () => {
    expect(await contar(devuelve({ data: null, error: null, status: 200, count: null }))).toEqual({
      ok: false,
      codigo: SIN_SERVIDOR,
    });
  });
});

describe('leerPagina (registro paginado, FR-123)', () => {
  it('trae las filas y el total de Content-Range', async () => {
    const r = await leerPagina<{ id: string }>(devuelve({ data: [{ id: 'a' }], error: null, status: 200, count: 412 }));
    expect(r).toEqual({ ok: true, datos: { filas: [{ id: 'a' }], total: 412 } });
  });

  it('sin total, el total es lo que ha llegado', async () => {
    const r = await leerPagina(devuelve({ data: [{ id: 'a' }, { id: 'b' }], error: null, status: 200, count: null }));
    expect(r).toEqual({ ok: true, datos: { filas: [{ id: 'a' }, { id: 'b' }], total: 2 } });
  });
});

describe('funcion (Pages Functions con el JWT de jefatura, 05 §9)', () => {
  it('manda el JWT y devuelve el cuerpo', async () => {
    const fetchFalso = vi.fn((ruta: string, init: RequestInit) => {
      expect(ruta).toBe('/api/lanzar-workflow');
      expect(init.method).toBe('POST');
      return Promise.resolve(respuesta(202, { lanzada: true }));
    });
    vi.stubGlobal('fetch', fetchFalso);
    const r = await funcion('/api/lanzar-workflow', { metodo: 'POST', cuerpo: { workflow: 'regenerar-zona' } });
    expect(r).toEqual({ ok: true, datos: { lanzada: true } });
    const init = fetchFalso.mock.calls[0][1];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-de-jefatura');
    expect(init.body).toBe('{"workflow":"regenerar-zona"}');
  });

  it('sin sesión no se llama a la Function', async () => {
    cliente.auth.getSession.mockResolvedValueOnce({ data: { session: null } } as never);
    const fetchFalso = vi.fn();
    vi.stubGlobal('fetch', fetchFalso);
    expect(await funcion('/api/lanzar-workflow')).toEqual({ ok: false, codigo: 'NO_AUTORIZADO' });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('un error con código es respuesta de la Function: el servidor está vivo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(503, { error: 'NO_CONFIGURADO' })),
    );
    expect(await funcion('/api/lanzar-workflow')).toEqual({ ok: false, codigo: 'NO_CONFIGURADO' });
    expect(estadoConexion()).toBe('bien');
  });

  it('un 500 mudo o la red rota sí es caída', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    );
    expect(await funcion('/api/x')).toEqual({ ok: false, codigo: SIN_SERVIDOR });
    expect(estadoConexion()).toBe('sin_servidor');
  });

  it('jwt() devuelve el token de la sesión de Google', async () => {
    await expect(jwt()).resolves.toBe('jwt-de-jefatura');
  });
});
