// La capa de llamadas (05 §6, §8, FR-168): nunca lanza, traduce el error a un código y distingue
// "el servidor ha dicho que no" de "el servidor no está", que es lo que enciende el aviso.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { almacenEnMemoria, respuesta } from './pruebas';

const rpcCliente = vi.fn();
let hayCliente = true;
vi.mock('./supabase', () => ({ supabase: () => (hayCliente ? { rpc: rpcCliente } : null) }));

const { SIN_SERVIDOR, codigoDeError, rpc, verificarCodigo } = await import('./api');
const { _reiniciar, estadoConexion } = await import('./conexion');

beforeEach(() => {
  almacenEnMemoria();
  hayCliente = true;
  rpcCliente.mockReset();
  _reiniciar();
});
afterEach(() => vi.unstubAllGlobals());

describe('codigoDeError (05 §8)', () => {
  it('saca el código del mensaje de la RPC, con o sin detalle', () => {
    expect(codigoDeError('PUNTO_NO_ACTIVO: el punto ya no está')).toBe('PUNTO_NO_ACTIVO');
    expect(codigoDeError('PAYLOAD_INVALIDO(caudal): valor raro')).toBe('PAYLOAD_INVALIDO(caudal)');
  });

  it('lo que no tiene forma de código es un error interno', () => {
    expect(codigoDeError('algo ha fallado')).toBe('ERROR_INTERNO');
    expect(codigoDeError(undefined)).toBe('ERROR_INTERNO');
  });
});

describe('rpc (FR-168)', () => {
  it('respuesta buena: devuelve los datos y el servidor cuenta como vivo', async () => {
    rpcCliente.mockResolvedValue({ data: [{ id: 'p1' }], error: null, status: 200 });
    await expect(rpc('fn_puntos')).resolves.toEqual({ ok: true, datos: [{ id: 'p1' }] });
    expect(estadoConexion()).toBe('bien');
  });

  it('un "no" del servidor (4xx) es un código, y el servidor sigue vivo', async () => {
    rpcCliente.mockResolvedValue({ data: null, error: { message: 'MOTIVO_OBLIGATORIO: falta' }, status: 400 });
    await expect(rpc('fn_rechazar')).resolves.toEqual({ ok: false, codigo: 'MOTIVO_OBLIGATORIO' });
    expect(estadoConexion()).toBe('bien');
  });

  it('un 500 o una red caída son SERVIDOR_NO_DISPONIBLE y encienden el aviso', async () => {
    rpcCliente.mockResolvedValue({ data: null, error: { message: 'boom' }, status: 500 });
    await expect(rpc('fn_puntos')).resolves.toEqual({ ok: false, codigo: SIN_SERVIDOR });
    expect(estadoConexion()).toBe('sin_servidor');

    _reiniciar();
    rpcCliente.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(rpc('fn_puntos')).resolves.toEqual({ ok: false, codigo: SIN_SERVIDOR });
    expect(estadoConexion()).toBe('sin_servidor');
  });

  it('sin cliente configurado tampoco lanza', async () => {
    hayCliente = false;
    await expect(rpc('fn_puntos')).resolves.toEqual({ ok: false, codigo: SIN_SERVIDOR });
  });
});

describe('verificarCodigo (FR-31)', () => {
  it('devuelve el token cuando la Function lo da por bueno', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(200, { token: 't-1', caduca_en: '2027-01-01T00:00:00Z' })),
    );
    const r = await verificarCodigo('ALBOLOTE-2026', 'd-1');
    expect(r).toEqual({ ok: true, datos: { token: 't-1', caduca_en: '2027-01-01T00:00:00Z' } });
  });

  it('un código equivocado es un "no" con su motivo, no una caída', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(401, { error: 'CODIGO_INCORRECTO' })),
    );
    await expect(verificarCodigo('mal', 'd-1')).resolves.toEqual({ ok: false, codigo: 'CODIGO_INCORRECTO' });
    expect(estadoConexion()).toBe('bien');
  });

  it('un 500 sin cuerpo, o la red rota, es SERVIDOR_NO_DISPONIBLE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 502 })),
    );
    await expect(verificarCodigo('x', 'd-1')).resolves.toEqual({ ok: false, codigo: SIN_SERVIDOR });

    _reiniciar();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(verificarCodigo('x', 'd-1')).resolves.toEqual({ ok: false, codigo: SIN_SERVIDOR });
    expect(estadoConexion()).toBe('sin_servidor');
  });

  it('el código nunca se guarda en el móvil (11 §2)', async () => {
    const almacen = almacenEnMemoria();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(200, { token: 't-1', caduca_en: '2027-01-01T00:00:00Z' })),
    );
    await verificarCodigo('ALBOLOTE-2026', 'd-1');
    expect([...almacen.values()].join(' ')).not.toContain('ALBOLOTE-2026');
  });
});
