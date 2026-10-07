// Errores del cliente (TR-90, TR-106): cola local que se vacía en fn_registrar_error.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { almacenEnMemoria } from './pruebas';

const rpc = vi.fn();
vi.mock('./supabase', () => ({ supabase: () => ({ rpc }) }));

const { MAXIMO_EN_COLA, anotarError, enviarErrores, erroresPendientes } = await import('./errores');
const { _reiniciar } = await import('./conexion');
const { dispositivoId } = await import('./sesion');

let funcion: ReturnType<typeof vi.fn>;
const caido = { data: null, status: 0, error: { message: 'Failed to fetch' } };
const bien = { data: null, status: 204, error: null };

beforeEach(() => {
  almacenEnMemoria();
  vi.stubGlobal('location', { pathname: '/ajustes', search: '' });
  _reiniciar();
  rpc.mockReset();
  // Por defecto, una app servida antes de la Function /api/error: 404 y la RPC de siempre.
  funcion = vi.fn(async () => new Response('', { status: 404 }));
  vi.stubGlobal('fetch', funcion);
});
afterEach(() => {
  vi.unstubAllGlobals();
  _reiniciar();
});

describe('cola de errores', () => {
  it('sin servidor se guardan, como mucho los últimos 20', async () => {
    rpc.mockResolvedValue(caido);
    for (let i = 0; i < MAXIMO_EN_COLA + 5; i++) anotarError(new Error(`fallo ${i}`));
    await vi.waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(erroresPendientes()).toBe(MAXIMO_EN_COLA);
  });

  it('con servidor se envían con el identificador del móvil y se vacía la cola', async () => {
    rpc.mockResolvedValue(caido);
    anotarError(new Error('uno'));
    anotarError('dos');
    await vi.waitFor(() => expect(rpc).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0)); // que termine el envío en curso

    rpc.mockReset();
    rpc.mockResolvedValue(bien);
    expect(await enviarErrores()).toBe(2);
    expect(erroresPendientes()).toBe(0);
    expect(rpc).toHaveBeenCalledWith('fn_registrar_error', {
      dispositivo_id: dispositivoId(),
      mensaje: 'uno',
      pila: expect.stringContaining('Error: uno'),
      ruta: '/ajustes',
      agente: expect.any(String),
    });
  });

  it('recorta mensaje y pila a los límites de TR-90', async () => {
    rpc.mockResolvedValue(caido);
    const e = new Error('m'.repeat(5000));
    e.stack = 'p'.repeat(10_000);
    anotarError(e);
    await vi.waitFor(() => expect(rpc).toHaveBeenCalled());
    const args = rpc.mock.calls[0][1];
    expect(args.mensaje).toHaveLength(1000);
    expect(args.pila).toHaveLength(4096);
  });
});

describe('POST /api/error (docs/31 RV-148)', () => {
  it('con la Function, el error va por ella y no por la RPC', async () => {
    funcion.mockResolvedValue(new Response(null, { status: 204 }));
    anotarError(new Error('uno'));
    await vi.waitFor(() => expect(erroresPendientes()).toBe(0));
    expect(rpc).not.toHaveBeenCalled();
    const [url, init] = funcion.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/error');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      dispositivo_id: dispositivoId(),
      mensaje: 'uno',
      pila: expect.stringContaining('Error: uno'),
      ruta: '/ajustes',
      agente: expect.any(String),
    });
  });

  it('sin la Function (404 o la página de la app), la RPC de 5 argumentos', async () => {
    funcion.mockResolvedValue(
      new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    );
    rpc.mockResolvedValue(bien);
    anotarError(new Error('dos'));
    await vi.waitFor(() => expect(erroresPendientes()).toBe(0));
    expect(rpc).toHaveBeenCalledWith('fn_registrar_error', expect.objectContaining({ mensaje: 'dos' }));
  });

  it('sin red, se queda en la cola y no se prueba la RPC', async () => {
    funcion.mockRejectedValue(new TypeError('Failed to fetch'));
    anotarError(new Error('tres'));
    await vi.waitFor(() => expect(funcion).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(erroresPendientes()).toBe(1);
    expect(rpc).not.toHaveBeenCalled();
  });
});
