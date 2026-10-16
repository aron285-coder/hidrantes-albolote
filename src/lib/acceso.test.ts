// Acceso del voluntario contra un servidor simulado: /api/verificar-codigo por fetch y las RPC por
// un cliente de Supabase falso.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { almacenEnMemoria, respuesta } from './pruebas';

const rpc = vi.fn();
/** Sesión de Google que devuelve supabase-js (null: ninguna). */
let sesionGoogle: { access_token: string; user: { email: string; id?: string } } | null = null;
/** Renovar la sesión tras unir la cuenta (docs/36 RV-450): por defecto, con un JWT nuevo. */
const refreshSession = vi.fn(async () => ({ data: { session: sesionGoogle }, error: null as Error | null }));
const signOut = vi.fn(async () => ({}));
vi.mock('./supabase', () => ({
  supabase: () => ({
    rpc,
    auth: { getSession: async () => ({ data: { session: sesionGoogle } }), signOut, refreshSession },
    // La sincronización de jefatura: sin puntos.
    from: () => ({
      // Páginas por clave (RV-65): limit la primera, gt(...).limit las siguientes.
      select: () => ({
        order: () => {
          const pagina = async () => ({ data: [], error: null, status: 200 });
          return { limit: pagina, gt: () => ({ limit: pagina }) };
        },
      }),
    }),
  }),
}));

const reintentarCola = vi.fn(async () => undefined);
const resincronizarPush = vi.fn(async () => undefined);
vi.mock('./push', async (original) => ({ ...(await original<typeof import('./push')>()), resincronizarPush }));
vi.mock('./cola', async (original) => ({ ...(await original<typeof import('./cola')>()), reintentarCola }));

const {
  _reiniciarAcceso,
  acceso,
  comprobarAcceso,
  dejarJefatura,
  direccionSinOauth,
  entrarConCodigo,
  limpiarDireccion,
  reintentarComprobacion,
  salirDeGoogle,
  volverAEntrada,
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
  refreshSession.mockClear();
  signOut.mockClear();
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
    // Al revocar se borraron las suscripciones (DEC-218): se piden ya, sin esperar a la vuelta diaria (docs/39 RV-520).
    expect(resincronizarPush).toHaveBeenCalledWith(TOKEN, expect.any(Number), true);

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

  it('DISPOSITIVO_RESERVADO: otro identificador y un solo reintento (docs/31 RV-159)', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(respuesta(409, { error: 'DISPOSITIVO_RESERVADO' }))
      .mockResolvedValueOnce(respuesta(200, { token: TOKEN, caduca_en: '2027-09-19T00:00:00Z' }));
    vi.stubGlobal('fetch', fetch);
    expect(await entrarConCodigo('482915', { nombre: 'Ana', apellido: 'Ruiz' })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
    const id = (n: number) =>
      JSON.parse((fetch.mock.calls[n] as unknown as [string, RequestInit])[1].body as string).dispositivo_id;
    expect(id(1)).not.toBe(id(0));
    expect(id(1)).toMatch(/^[0-9a-f-]{36}$/);
    expect(acceso().tipo).toBe('voluntario');
  });

  it('DISPOSITIVO_RESERVADO dos veces: el error de siempre, sin más reintentos (docs/31 RV-159)', async () => {
    const fetch = vi.fn(async () => respuesta(409, { error: 'DISPOSITIVO_RESERVADO' }));
    vi.stubGlobal('fetch', fetch);
    expect(await entrarConCodigo('482915', { nombre: 'Ana', apellido: 'Ruiz' })).toEqual({
      codigo: 'DISPOSITIVO_RESERVADO',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(acceso().tipo).toBe('fuera');
  });

  it('demasiados intentos bloquea la entrada una hora', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(429, { error: 'DEMASIADOS_INTENTOS' })),
    );
    expect(await entrarConCodigo('000001', { nombre: 'Ana', apellido: 'Ruiz' })).toEqual({
      codigo: 'DEMASIADOS_INTENTOS',
    });
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
    // Sin acceso ya: la Function lo confirma (docs/35 RV-432).
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(403, { error: 'NO_ES_ADMINISTRADOR' })),
    );
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

  // docs/35 RV-431: quitarse el acceso a uno mismo saca del panel sin volver a preguntar al servidor.
  it('dejar jefatura: «No autorizado», sin confirmación ni sesión guardadas, y sin red tampoco vuelve', async () => {
    conGoogle('jefa@example.org');
    rpc.mockResolvedValueOnce({ data: true, error: null, status: 200 });
    await comprobarAcceso();
    rpc.mockClear();
    await dejarJefatura();
    expect(acceso()).toEqual({ tipo: 'no_autorizado' });
    expect(rpc).not.toHaveBeenCalled();
    expect(datos.has('hidrantes.jefatura_confirmada')).toBe(false);
    expect(datos.has('hidrantes.auth')).toBe(false);

    // Otro arranque sin red: ya no entra como jefatura con lo guardado.
    sesionGoogle = null;
    _reiniciarAcceso();
    vi.stubGlobal('navigator', { onLine: false });
    await comprobarAcceso();
    expect(acceso().tipo).not.toBe('jefatura');
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

// docs/35 RV-432: la cuenta de jefatura se une a su cuenta de Google al entrar, una vez por sesión.
describe('unir la cuenta de jefatura al entrar (docs/35 RV-432)', () => {
  const si = { data: true, error: null, status: 200 };
  const no = { data: false, error: null, status: 200 };
  let fetch: ReturnType<typeof vi.fn>;
  const entrar = () => {
    datos.set('hidrantes.auth', '{"sesion":"guardada"}');
    sesionGoogle = { access_token: 'jwt.de.sesion', user: { id: 'u1', email: 'jefa@example.org' } };
    _reiniciarAcceso();
  };
  const contesta = (status: number, cuerpo: unknown) => {
    fetch = vi.fn(async () => respuesta(status, cuerpo));
    vi.stubGlobal('fetch', fetch);
  };
  /** Las peticiones a la Function (un fallo anotado va aparte, a /api/error). */
  const pedidas = () => fetch.mock.calls.filter(([ruta]) => ruta === '/api/vincular-jefatura').length;
  afterEach(() => {
    sesionGoogle = null;
  });

  it('sin unir: la une con el JWT de la sesión, vuelve a preguntar y entra', async () => {
    entrar();
    contesta(200, { resultado: 'VINCULADO' });
    rpc.mockResolvedValueOnce(no).mockResolvedValueOnce(si);
    await comprobarAcceso();
    expect(acceso()).toEqual({ tipo: 'jefatura', correo: 'jefa@example.org' });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [ruta, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(ruta).toBe('/api/vincular-jefatura');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer jwt.de.sesion', 'Content-Type': 'application/json' });
    expect(rpc.mock.calls.filter(([n]) => n === 'fn_es_admin')).toHaveLength(2);
  });

  it('YA_VINCULADO también entra', async () => {
    entrar();
    contesta(200, { resultado: 'YA_VINCULADO' });
    rpc.mockResolvedValueOnce(no).mockResolvedValueOnce(si);
    await comprobarAcceso();
    expect(acceso().tipo).toBe('jefatura');
  });

  it.each([
    [403, { error: 'NO_ES_ADMINISTRADOR' }],
    [403, { error: 'SIN_GOOGLE' }],
    [401, { error: 'NO_AUTORIZADO' }],
  ])('%s %o: «No autorizado», sin volver a preguntar ni a pedirlo otra vez', async (status, cuerpo) => {
    entrar();
    contesta(status, cuerpo);
    rpc.mockResolvedValue(no);
    await comprobarAcceso();
    expect(acceso()).toEqual({ tipo: 'no_autorizado' });
    expect(rpc.mock.calls.filter(([n]) => n === 'fn_es_admin')).toHaveLength(1);
    // Otra comprobación en la misma sesión: no se vuelve a pedir (sin bucle).
    await comprobarAcceso();
    expect(pedidas()).toBe(1);
  });

  it.each([
    [429, { error: 'DEMASIADOS_INTENTOS' }],
    [500, { error: 'ERROR_INTERNO' }],
    [503, { error: 'SERVIDOR_NO_DISPONIBLE' }],
    [403, { error: 'ORIGEN_NO_PERMITIDO' }],
    [200, { resultado: 'OTRO' }],
  ])('%s %o: «no se ha podido comprobar», sin cerrar la sesión ni pedirlo solo otra vez', async (status, cuerpo) => {
    entrar();
    contesta(status, cuerpo);
    rpc.mockResolvedValue(no);
    await comprobarAcceso();
    expect(acceso()).toEqual({ tipo: 'no_autorizado', sinComprobar: true });
    expect(datos.has('hidrantes.auth')).toBe(true);
    // Otra comprobación automática en la misma sesión: ni se vuelve a pedir ni cambia la pantalla.
    await comprobarAcceso();
    expect(pedidas()).toBe(1);
    expect(acceso()).toEqual({ tipo: 'no_autorizado', sinComprobar: true });
  });

  it('sin red: «no se ha podido comprobar»', async () => {
    entrar();
    fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetch);
    rpc.mockResolvedValue(no);
    await comprobarAcceso();
    expect(acceso()).toEqual({ tipo: 'no_autorizado', sinComprobar: true });
  });

  it('Reintentar vuelve a pedirlo una vez y, si se une, entra', async () => {
    entrar();
    contesta(503, { error: 'SERVIDOR_NO_DISPONIBLE' });
    rpc.mockResolvedValueOnce(no);
    await comprobarAcceso();
    expect(acceso()).toEqual({ tipo: 'no_autorizado', sinComprobar: true });
    contesta(200, { resultado: 'VINCULADO' });
    rpc.mockResolvedValueOnce(no).mockResolvedValueOnce(si);
    await reintentarComprobacion();
    expect(acceso()).toEqual({ tipo: 'jefatura', correo: 'jefa@example.org' });
    expect(pedidas()).toBe(1);
  });

  it('Reintentar que vuelve a fallar: la misma pantalla, una sola petición más', async () => {
    entrar();
    contesta(503, { error: 'SERVIDOR_NO_DISPONIBLE' });
    rpc.mockResolvedValue(no);
    await comprobarAcceso();
    await reintentarComprobacion();
    expect(acceso()).toEqual({ tipo: 'no_autorizado', sinComprobar: true });
    expect(pedidas()).toBe(2);
  });

  it('dos comprobaciones a la vez: una sola petición, y las dos entran', async () => {
    entrar();
    contesta(200, { resultado: 'VINCULADO' });
    let unida = false;
    rpc.mockImplementation(async () => ({ data: unida, error: null, status: 200 }));
    fetch.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      unida = true;
      return respuesta(200, { resultado: 'VINCULADO' });
    });
    await Promise.all([comprobarAcceso(), comprobarAcceso()]);
    expect(pedidas()).toBe(1);
    // Una sola renovación de la sesión (docs/36 RV-450).
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(acceso()).toEqual({ tipo: 'jefatura', correo: 'jefa@example.org' });
  });

  it('Reintentar sin servidor: sigue en la misma pantalla, sin volver a la entrada', async () => {
    entrar();
    contesta(503, { error: 'SERVIDOR_NO_DISPONIBLE' });
    rpc.mockResolvedValueOnce(no);
    await comprobarAcceso();
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' }, status: 0 });
    await reintentarComprobacion();
    expect(acceso()).toEqual({ tipo: 'no_autorizado', sinComprobar: true });
    expect(pedidas()).toBe(1);
  });

  it('unida, pero sin servidor para volver a preguntar: «no se ha podido comprobar»', async () => {
    entrar();
    contesta(200, { resultado: 'VINCULADO' });
    rpc
      .mockResolvedValueOnce(no)
      .mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' }, status: 0 });
    await comprobarAcceso();
    expect(acceso()).toEqual({ tipo: 'no_autorizado', sinComprobar: true });
  });

  // docs/36 RV-450: con la sesión ya renovada, un «no» no cuadra con la unión: se anota y se deja
  // reintentar, sin cerrar la sesión (antes era «No autorizado»).
  it('unida, pero el servidor sigue diciendo que no: «no se ha podido comprobar», anotado', async () => {
    entrar();
    contesta(200, { resultado: 'VINCULADO' });
    rpc.mockResolvedValue(no);
    await comprobarAcceso();
    expect(acceso()).toEqual({ tipo: 'no_autorizado', sinComprobar: true });
    expect(signOut).not.toHaveBeenCalled();
    expect(fetch.mock.calls.filter(([ruta]) => ruta === '/api/error')).toHaveLength(1);
  });

  // docs/37 RV-493: el correo de jefatura ya está unido a otra cuenta de Google; el panel dice qué hacer.
  it('OTRA_CUENTA: «No autorizado» con su texto, sesión cerrada, sin pedirlo otra vez', async () => {
    entrar();
    contesta(403, { error: 'OTRA_CUENTA' });
    rpc.mockResolvedValue(no);
    await comprobarAcceso();
    expect(acceso()).toEqual({ tipo: 'no_autorizado', otraCuenta: true });
    expect(signOut).toHaveBeenCalled();
    expect(rpc.mock.calls.filter(([n]) => n === 'fn_es_admin')).toHaveLength(1);
    await comprobarAcceso();
    expect(pedidas()).toBe(1);
  });

  it('otra cuenta de Google en el mismo navegador: se vuelve a pedir', async () => {
    entrar();
    contesta(403, { error: 'OTRA_CUENTA' });
    rpc.mockResolvedValue(no);
    await comprobarAcceso();
    datos.set('hidrantes.auth', '{"sesion":"guardada"}');
    sesionGoogle = { access_token: 'otro.jwt', user: { id: 'u2', email: 'otra@example.org' } };
    await comprobarAcceso();
    expect(pedidas()).toBe(2);
  });

  it('Volver sin poder comprobar cierra la sesión de Google', async () => {
    entrar();
    contesta(503, { error: 'SERVIDOR_NO_DISPONIBLE' });
    rpc.mockResolvedValue(no);
    await comprobarAcceso();
    volverAEntrada();
    expect(datos.has('hidrantes.auth')).toBe(false);
    expect(acceso().tipo).toBe('fuera');
  });

  // docs/36 RV-450 (DEC-206): la jefatura solo vale con un JWT emitido después de la unión.
  it('VINCULADO: renueva la sesión antes de volver a preguntar', async () => {
    entrar();
    contesta(200, { resultado: 'VINCULADO' });
    const orden: string[] = [];
    rpc.mockImplementation(async (nombre: string) => {
      orden.push(nombre);
      return orden.length === 1 ? no : si;
    });
    refreshSession.mockImplementationOnce(async () => {
      orden.push('refreshSession');
      return { data: { session: sesionGoogle }, error: null };
    });
    await comprobarAcceso();
    expect(orden.slice(0, 3)).toEqual(['fn_es_admin', 'refreshSession', 'fn_es_admin']);
    expect(acceso().tipo).toBe('jefatura');
  });

  it('YA_VINCULADO también renueva la sesión', async () => {
    entrar();
    contesta(200, { resultado: 'YA_VINCULADO' });
    rpc.mockResolvedValueOnce(no).mockResolvedValueOnce(si);
    await comprobarAcceso();
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(acceso().tipo).toBe('jefatura');
  });

  it.each([
    ['con error', async () => ({ data: { session: null }, error: new Error('sin red') })],
    ['sin sesión', async () => ({ data: { session: null }, error: null })],
    [
      'que lanza',
      async () => {
        throw new TypeError('Failed to fetch');
      },
    ],
  ])('unida, pero la sesión no se renueva (%s): «no se ha podido comprobar», sin cerrarla', async (_, fallo) => {
    entrar();
    contesta(200, { resultado: 'VINCULADO' });
    rpc.mockResolvedValue(no);
    refreshSession.mockImplementationOnce(fallo as never);
    await comprobarAcceso();
    expect(acceso()).toEqual({ tipo: 'no_autorizado', sinComprobar: true });
    expect(signOut).not.toHaveBeenCalled();
    expect(datos.has('hidrantes.auth')).toBe(true);
    // Solo la primera pregunta: con el token de antes, el servidor diría que no.
    expect(rpc.mock.calls.filter(([n]) => n === 'fn_es_admin')).toHaveLength(1);
    // El fallo de la renovación queda anotado.
    expect(fetch.mock.calls.filter(([ruta]) => ruta === '/api/error')).toHaveLength(1);
  });

  it('CUENTA_MEZCLADA: «No autorizado» con su texto, sesión cerrada, sin pedirlo otra vez', async () => {
    entrar();
    contesta(403, { error: 'CUENTA_MEZCLADA' });
    rpc.mockResolvedValue(no);
    await comprobarAcceso();
    expect(acceso()).toEqual({ tipo: 'no_autorizado', cuentaMezclada: true });
    expect(signOut).toHaveBeenCalled();
    expect(refreshSession).not.toHaveBeenCalled();
    // Queda anotado, sin datos de la cuenta.
    const anotados = fetch.mock.calls.filter(([ruta]) => ruta === '/api/error');
    expect(anotados).toHaveLength(1);
    expect(String((anotados[0]![1] as RequestInit).body)).toContain('CUENTA_MEZCLADA');
    expect(String((anotados[0]![1] as RequestInit).body)).not.toContain('jefa@example.org');
    datos.set('hidrantes.auth', '{"sesion":"guardada"}');
    await comprobarAcceso();
    expect(pedidas()).toBe(1);
  });

  it('«unida» no se recuerda: si después la cuenta deja de ser jefatura, se vuelve a pedir', async () => {
    entrar();
    contesta(200, { resultado: 'VINCULADO' });
    rpc.mockResolvedValueOnce(no).mockResolvedValueOnce(si);
    await comprobarAcceso();
    expect(acceso().tipo).toBe('jefatura');
    // La unión se ha deshecho en el servidor: la próxima comprobación no da por buena la de antes.
    contesta(403, { error: 'CUENTA_MEZCLADA' });
    rpc.mockResolvedValue(no);
    await comprobarAcceso();
    expect(pedidas()).toBe(1);
    expect(acceso()).toEqual({ tipo: 'no_autorizado', cuentaMezclada: true });
  });

  it('ya es jefatura: no se pide nada', async () => {
    entrar();
    contesta(200, { resultado: 'VINCULADO' });
    rpc.mockResolvedValue(si);
    await comprobarAcceso();
    expect(acceso().tipo).toBe('jefatura');
    expect(pedidas()).toBe(0);
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

describe('cerrar sesión con el móvil compartido (RV-153)', () => {
  it('no deja a la vista las propuestas del anterior', async () => {
    const { cerrarSesionVoluntario } = await import('./acceso');
    const { cargarMisPropuestas, misPropuestas } = await import('./mis-propuestas');
    guardarSesion(TOKEN, { nombre: 'Sara', apellido: 'Ruiz' });
    rpc.mockResolvedValue({ data: [{ id: 'p1', estado: 'rechazada', motivo_rechazo: 'x' }], error: null, status: 200 });
    await cargarMisPropuestas();
    expect(misPropuestas()).toHaveLength(1);

    await cerrarSesionVoluntario();
    expect(misPropuestas()).toEqual([]);
  });
});

describe('cerrar sesión revoca el token (docs/31 RV-158)', () => {
  const llamadas = (nombre: string) => rpc.mock.calls.filter((c) => c[0] === nombre);
  const erroresAnotados = () => JSON.parse(datos.get('hidrantes.errores_pendientes') ?? '[]') as { mensaje: string }[];

  it('llama a fn_cerrar_sesion con el token antes de borrar lo local', async () => {
    const { cerrarSesionVoluntario } = await import('./acceso');
    guardarSesion(TOKEN, { nombre: 'Ana', apellido: 'Ruiz' });
    rpc.mockResolvedValue({ data: null, error: null, status: 204 });
    await cerrarSesionVoluntario();
    expect(llamadas('fn_cerrar_sesion')).toEqual([['fn_cerrar_sesion', { token: TOKEN }]]);
    expect(acceso().tipo).toBe('fuera');
    expect(leerFirma()).toBeNull();
  });

  it('sin red, la sesión se cierra igual y queda anotado', async () => {
    const { cerrarSesionVoluntario } = await import('./acceso');
    guardarSesion(TOKEN, { nombre: 'Ana', apellido: 'Ruiz' });
    rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' }, status: 0 });
    await cerrarSesionVoluntario();
    expect(acceso().tipo).toBe('fuera');
    expect(leerFirma()).toBeNull();
    expect(erroresAnotados().some((e) => e.mensaje.includes('fn_cerrar_sesion'))).toBe(true);
  });

  it('si el servidor no contesta, no se espera más de su límite', async () => {
    const { cerrarSesionVoluntario } = await import('./acceso');
    const { LIMITES_RED } = await import('./red');
    expect(LIMITES_RED.cerrarSesion).toBe(5000);
    LIMITES_RED.cerrarSesion = 30;
    try {
      guardarSesion(TOKEN, { nombre: 'Ana', apellido: 'Ruiz' });
      rpc.mockImplementation((nombre: string) =>
        nombre === 'fn_cerrar_sesion' ? new Promise(() => undefined) : Promise.resolve({ data: null, error: null }),
      );
      // Los errores salen por POST /api/error desde #524 (RV-148): aquí el servidor los acepta.
      const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => respuesta(200, {}));
      vi.stubGlobal('fetch', fetch);
      await cerrarSesionVoluntario();
      expect(acceso().tipo).toBe('fuera');
      await vi.waitFor(() =>
        expect(
          fetch.mock.calls.some(
            ([url, init]) => url === '/api/error' && String(init?.body).includes('fn_cerrar_sesion: TIEMPO_AGOTADO'),
          ),
        ).toBe(true),
      );
    } finally {
      LIMITES_RED.cerrarSesion = 5000;
    }
  }, 2000);
});

// docs/39 RV-520 (DEC-221): con un formulario abierto, revocar el acceso no salta a la entrada.
describe('el formulario no se pierde al revocar el acceso (docs/39 RV-520)', () => {
  beforeEach(async () => {
    guardarSesion(TOKEN, { nombre: 'Ana', apellido: 'Ruiz' });
    _reiniciarAcceso();
    (await import('./formulario-abierto'))._reiniciarFormularios();
  });

  it('TOKEN_REVOCADO con un formulario abierto: accesoCaducado, el token sigue y no se va a la entrada', async () => {
    const { abrirFormulario } = await import('./formulario-abierto');
    const { leerSesion } = await import('./sesion');
    const cerrar = abrirFormulario();
    rpc.mockResolvedValue({ data: null, status: 400, error: { message: 'TOKEN_REVOCADO: revocado' } });
    await comprobarAcceso();
    expect(acceso()).toMatchObject({ tipo: 'voluntario', accesoCaducado: true });
    expect(leerSesion()?.token).toBe(TOKEN);
    // Al cerrar el formulario, la entrada y el token olvidado.
    cerrar();
    await new Promise((ok) => setTimeout(ok, 0));
    expect(acceso()).toEqual({ tipo: 'fuera', caducado: true });
    expect(leerSesion()).toBeNull();
  });

  it('del formulario a su pantalla de resultado no se sale: el aviso espera a que no quede ninguno', async () => {
    const { abrirFormulario } = await import('./formulario-abierto');
    const cerrarFormulario = abrirFormulario();
    rpc.mockResolvedValue({ data: null, status: 400, error: { message: 'TOKEN_REVOCADO: revocado' } });
    await comprobarAcceso();
    cerrarFormulario();
    const cerrarResultado = abrirFormulario();
    await new Promise((ok) => setTimeout(ok, 0));
    expect(acceso()).toMatchObject({ tipo: 'voluntario', accesoCaducado: true });
    cerrarResultado();
    await new Promise((ok) => setTimeout(ok, 0));
    expect(acceso().tipo).toBe('fuera');
  });

  it('sin formulario abierto, como siempre: a la entrada', async () => {
    rpc.mockResolvedValue({ data: null, status: 400, error: { message: 'TOKEN_REVOCADO: revocado' } });
    await comprobarAcceso();
    expect(acceso()).toEqual({ tipo: 'fuera', caducado: true });
  });
});
