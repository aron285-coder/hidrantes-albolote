// Acceso del voluntario contra un servidor simulado: /api/verificar-codigo por fetch y las RPC por
// un cliente de Supabase falso.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { almacenEnMemoria, respuesta } from './pruebas';

const rpc = vi.fn();
vi.mock('./supabase', () => ({
  supabase: () => ({ rpc, auth: { getSession: async () => ({ data: { session: null } }) } }),
}));

const reintentarCola = vi.fn(async () => undefined);
vi.mock('./cola', async (original) => ({ ...(await original<typeof import('./cola')>()), reintentarCola }));

const { _reiniciarAcceso, acceso, comprobarAcceso, entrarConCodigo } = await import('./acceso');
const { codigoDeError, SIN_SERVIDOR, verificarCodigo } = await import('./api');
const { _reiniciar, estadoConexion } = await import('./conexion');
const { guardarSesion, leerFirma, bloqueadoHasta } = await import('./sesion');

const TOKEN = 'a'.repeat(43);
let datos: Map<string, string>;

beforeEach(() => {
  datos = almacenEnMemoria();
  vi.stubGlobal('location', { search: '', pathname: '/' });
  _reiniciar();
  _reiniciarAcceso();
  rpc.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  _reiniciar();
});

describe('códigos de error de las RPC (05 §8)', () => {
  it('extrae el código del mensaje', () => {
    expect(codigoDeError('TOKEN_REVOCADO: El acceso de este móvil se ha revocado')).toBe('TOKEN_REVOCADO');
    expect(codigoDeError('FUERA_DE_RANGO(diametro_mm): x')).toBe('FUERA_DE_RANGO(diametro_mm)');
    expect(codigoDeError('permission denied for function')).toBe('DESCONOCIDO');
  });
});

describe('canje del código (FR-31, FR-33)', () => {
  it('traduce cada respuesta de la Function y anota si el servidor respondió', async () => {
    const casos: [Response | Error, string | null][] = [
      [respuesta(401, { error: 'CODIGO_INCORRECTO' }), 'CODIGO_INCORRECTO'],
      [respuesta(429, { error: 'DEMASIADOS_INTENTOS', reintentar_en_s: 3600 }), 'DEMASIADOS_INTENTOS'],
      [respuesta(503, { error: 'SERVIDOR_NO_DISPONIBLE' }), SIN_SERVIDOR],
      [respuesta(502, 'Bad gateway'), SIN_SERVIDOR],
      [new TypeError('Failed to fetch'), SIN_SERVIDOR],
    ];
    for (const [r, codigo] of casos) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => (r instanceof Error ? Promise.reject(r) : r)),
      );
      const res = await verificarCodigo('123456', crypto.randomUUID());
      expect(res).toEqual({ ok: false, codigo });
      expect(estadoConexion()).toBe(codigo === SIN_SERVIDOR ? 'sin_servidor' : 'bien');
    }
  });

  it('al entrar guarda token, nombre e identificador; el código nunca (TR-43)', async () => {
    const fetch = vi.fn(async () => respuesta(200, { token: TOKEN, caduca_en: '2027-09-19T00:00:00Z' }));
    vi.stubGlobal('fetch', fetch);
    expect(await entrarConCodigo('482915', { nombre: 'Ana', apellido: 'Ruiz' })).toBeNull();
    expect(acceso()).toEqual({ tipo: 'voluntario', sesion: { token: TOKEN, nombre: 'Ana', apellido: 'Ruiz' } });

    const cuerpo = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(cuerpo).toEqual({ codigo: '482915', dispositivo_id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect([...datos.values()].join('|')).not.toContain('482915');
  });

  it('al volver a entrar con el código se reintenta la cola (RV-04)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(200, { token: TOKEN, caduca_en: '2027-09-19T00:00:00Z' })),
    );
    reintentarCola.mockClear();
    expect(await entrarConCodigo('482915', { nombre: 'Ana', apellido: 'Ruiz' })).toBeNull();
    expect(reintentarCola).toHaveBeenCalledTimes(1);
  });

  it('demasiados intentos bloquea la entrada una hora', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(429, { error: 'DEMASIADOS_INTENTOS' })),
    );
    expect(await entrarConCodigo('000001', { nombre: 'Ana', apellido: 'Ruiz' })).toBe('DEMASIADOS_INTENTOS');
    expect(bloqueadoHasta()).not.toBeNull();
    expect(acceso().tipo).toBe('fuera');
  });
});

describe('comprobación del acceso al arrancar (FR-35, FR-168)', () => {
  beforeEach(() => {
    guardarSesion(TOKEN, { nombre: 'Ana', apellido: 'Ruiz' });
    _reiniciarAcceso();
  });

  it('con token guardado entra sin esperar al servidor', () => {
    expect(acceso().tipo).toBe('voluntario');
  });

  it('token revocado: vuelve a la entrada avisando y conserva el nombre', async () => {
    rpc.mockResolvedValue({ data: null, status: 400, error: { message: 'TOKEN_REVOCADO: revocado' } });
    await comprobarAcceso();
    expect(rpc).toHaveBeenCalledWith('fn_listar_puntos', { token: TOKEN, desde: null });
    expect(acceso()).toEqual({ tipo: 'fuera', caducado: true });
    expect(leerFirma()).toEqual({ nombre: 'Ana', apellido: 'Ruiz' });
  });

  it('servidor caído: sigue dentro con lo guardado y marca la degradación', async () => {
    rpc.mockResolvedValue({ data: null, status: 0, error: { message: 'TypeError: Failed to fetch' } });
    await comprobarAcceso();
    expect(acceso().tipo).toBe('voluntario');
    expect(estadoConexion()).toBe('sin_servidor');
  });
});
