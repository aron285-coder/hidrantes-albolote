// Errores del cliente (TR-90, TR-106): cola local que se vacía por POST /api/error. Desde 0044
// (docs/33 RV-306) la RPC de 5 argumentos ya no es para anon: no se prueba nunca.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { almacenEnMemoria } from './pruebas';

const rpc = vi.fn();
vi.mock('./supabase', () => ({ supabase: () => ({ rpc }) }));

const { MAXIMO_EN_COLA, anotarError, enviarErrores, erroresPendientes } = await import('./errores');
const { _reiniciar } = await import('./conexion');
const { dispositivoId } = await import('./sesion');

let funcion: ReturnType<typeof vi.fn>;
const sinRed = () => Promise.reject(new TypeError('Failed to fetch'));
const bien = () => new Response(null, { status: 204 });
const cuerpos = () => funcion.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));

beforeEach(() => {
  almacenEnMemoria();
  vi.stubGlobal('location', { pathname: '/ajustes', search: '' });
  _reiniciar();
  rpc.mockReset();
  funcion = vi.fn(sinRed);
  vi.stubGlobal('fetch', funcion);
});
afterEach(() => {
  vi.unstubAllGlobals();
  _reiniciar();
});

describe('cola de errores', () => {
  it('sin servidor se guardan, como mucho los últimos 20', async () => {
    for (let i = 0; i < MAXIMO_EN_COLA + 5; i++) anotarError(new Error(`fallo ${i}`));
    await vi.waitFor(() => expect(funcion).toHaveBeenCalled());
    expect(erroresPendientes()).toBe(MAXIMO_EN_COLA);
  });

  it('con servidor se envían con el identificador del móvil y se vacía la cola', async () => {
    anotarError(new Error('uno'));
    anotarError('dos');
    await vi.waitFor(() => expect(funcion).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0)); // que termine el envío en curso

    funcion.mockReset().mockImplementation(async () => bien());
    expect(await enviarErrores()).toBe(2);
    expect(erroresPendientes()).toBe(0);
    expect(cuerpos()[0]).toEqual({
      dispositivo_id: dispositivoId(),
      mensaje: 'uno',
      pila: expect.stringContaining('Error: uno'),
      ruta: '/ajustes',
      agente: expect.any(String),
    });
  });

  it('recorta mensaje y pila a los límites de TR-90', async () => {
    const e = new Error('m'.repeat(5000));
    e.stack = 'p'.repeat(10_000);
    anotarError(e);
    await vi.waitFor(() => expect(funcion).toHaveBeenCalled());
    const [cuerpo] = cuerpos();
    expect(cuerpo.mensaje).toHaveLength(1000);
    expect(cuerpo.pila).toHaveLength(4096);
  });
});

describe('POST /api/error (docs/31 RV-148, docs/33 RV-306)', () => {
  it('con la Function, el error va por ella y no por la RPC', async () => {
    funcion.mockImplementation(async () => bien());
    anotarError(new Error('uno'));
    await vi.waitFor(() => expect(erroresPendientes()).toBe(0));
    expect(rpc).not.toHaveBeenCalled();
    const [url, init] = funcion.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/error');
    expect(init.method).toBe('POST');
  });

  it.each([
    ['404', () => new Response('', { status: 404 })],
    ['405', () => new Response('', { status: 405 })],
    [
      'la página de la app',
      () => new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    ],
  ])('sin la Function (%s), se queda en la cola y no se prueba la RPC', async (_caso, r) => {
    funcion.mockImplementation(async () => r());
    anotarError(new Error('dos'));
    await vi.waitFor(() => expect(funcion).toHaveBeenCalled());
    await new Promise((res) => setTimeout(res, 0));
    expect(erroresPendientes()).toBe(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sin red, se queda en la cola y no se prueba la RPC', async () => {
    anotarError(new Error('tres'));
    await vi.waitFor(() => expect(funcion).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(erroresPendientes()).toBe(1);
    expect(rpc).not.toHaveBeenCalled();
  });
});
