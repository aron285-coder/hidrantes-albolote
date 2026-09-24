// Acceso del voluntario contra un servidor simulado: /api/verificar-codigo por fetch y las RPC por
// un cliente de Supabase falso.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { almacenEnMemoria, respuesta } from './pruebas';

const rpc = vi.fn();
/** Sesión de Google que devuelve supabase-js (null: ninguna). */
let sesionGoogle: { access_token: string; user: { email: string } } | null = null;
vi.mock('./supabase', () => ({
  supabase: () => ({
    rpc,
    auth: { getSession: async () => ({ data: { session: sesionGoogle } }), signOut: async () => ({}) },
    // La sincronización de jefatura: sin puntos.
    from: () => ({
      select: () => ({ order: () => ({ range: async () => ({ data: [], error: null, status: 200 }) }) }),
    }),
  }),
}));

const reintentarCola = vi.fn(async () => undefined);
vi.mock('./cola', async (original) => ({ ...(await original<typeof import('./cola')>()), reintentarCola }));

const {
  _reiniciarAcceso,
  acceso,
  comprobarAcceso,
  direccionSinOauth,
  entrarConCodigo,
  limpiarDireccion,
  salirDeGoogle,
} = await import('./acceso');
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

describe('jefatura sin servidor al arrancar (RV-16, FR-168)', () => {
  const conGoogle = (correo: string) => {
    datos.set('hidrantes.auth', '{"sesion":"guardada"}');
    sesionGoogle = { access_token: 'a.b.c', user: { email: correo } };
    _reiniciarAcceso();
  };
  const caido = { data: null, error: { message: 'Failed to fetch' }, status: 0 };
  afterEach(() => {
    sesionGoogle = null;
  });

  it('jefatura confirmada sigue como jefatura si el servidor no responde', async () => {
    conGoogle('jefa@example.org');
    rpc.mockResolvedValueOnce({ data: true, error: null, status: 200 });
    await comprobarAcceso();
    expect(acceso()).toEqual({ tipo: 'jefatura', correo: 'jefa@example.org' });

    // Otro arranque, ahora sin servidor.
    _reiniciarAcceso();
    rpc.mockResolvedValue(caido);
    await comprobarAcceso();
    expect(acceso()).toEqual({ tipo: 'jefatura', correo: 'jefa@example.org' });
  });

  it('un correo distinto no hereda la confirmación', async () => {
    conGoogle('jefa@example.org');
    rpc.mockResolvedValueOnce({ data: true, error: null, status: 200 });
    await comprobarAcceso();
    conGoogle('otra@example.org');
    rpc.mockResolvedValue(caido);
    await comprobarAcceso();
    expect(acceso().tipo).not.toBe('jefatura');
  });

  it('fn_es_admin=false borra la confirmación', async () => {
    conGoogle('jefa@example.org');
    rpc.mockResolvedValueOnce({ data: true, error: null, status: 200 });
    await comprobarAcceso();
    rpc.mockResolvedValueOnce({ data: false, error: null, status: 200 });
    await comprobarAcceso();
    expect(acceso()).toEqual({ tipo: 'no_autorizado' });
    expect(datos.has('hidrantes.jefatura_confirmada')).toBe(false);
  });

  it('salir de Google borra la confirmación', async () => {
    conGoogle('jefa@example.org');
    rpc.mockResolvedValueOnce({ data: true, error: null, status: 200 });
    await comprobarAcceso();
    await salirDeGoogle();
    expect(datos.has('hidrantes.jefatura_confirmada')).toBe(false);
  });

  it('sin sesión devuelta y sin red, con la confirmación guardada, sigue en solo lectura', async () => {
    conGoogle('jefa@example.org');
    rpc.mockResolvedValueOnce({ data: true, error: null, status: 200 });
    await comprobarAcceso();
    sesionGoogle = null;
    _reiniciarAcceso();
    vi.stubGlobal('navigator', { onLine: false });
    await comprobarAcceso();
    expect(acceso()).toEqual({ tipo: 'jefatura', correo: 'jefa@example.org' });
  });
});

// docs/19 RV-57: jefatura perdía ?incidente=, ?p= y ?aqui= al recargar.
describe('la dirección tras volver de Google (RV-57)', () => {
  it('?incidente=…&code=x → ?incidente=…, con el hash', () => {
    expect(direccionSinOauth('/', '?incidente=37.230500,-3.656000&code=x&state=y', '#arriba')).toBe(
      '/?incidente=37.230500,-3.656000#arriba',
    );
    expect(direccionSinOauth('/admin', '?error=access_denied&error_description=no', '')).toBe('/admin');
  });

  it('?p=… sin code no cambia', () => {
    expect(direccionSinOauth('/', '?p=abc', '')).toBeNull();
    expect(direccionSinOauth('/', '', '')).toBeNull();
  });

  it('se limpia una sola vez: una segunda llamada no hace nada', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('history', { state: null, replaceState });
    vi.stubGlobal('location', { pathname: '/', search: '?incidente=1,2&code=x', hash: '' });
    limpiarDireccion();
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/?incidente=1,2');
    vi.stubGlobal('location', { pathname: '/', search: '?code=otra', hash: '' });
    limpiarDireccion();
    expect(replaceState).toHaveBeenCalledTimes(1);
  });

  it('sin parámetros de OAuth, no toca la dirección', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('history', { state: null, replaceState });
    vi.stubGlobal('location', { pathname: '/', search: '?p=abc&aqui=1,2', hash: '' });
    limpiarDireccion();
    expect(replaceState).not.toHaveBeenCalled();
  });
});
