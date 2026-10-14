// docs/35 RV-400 (DEC-197): la cuenta de jefatura se une a su usuario de Supabase Auth con el correo
// de su identidad de Google, nunca con el correo de la cuenta.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Env } from '../_lib/comun.ts';
import { _reiniciarLimites } from '../_lib/limite.ts';
import { correoDeGoogle, onRequestPost } from './vincular-jefatura.ts';

const ENV = {
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-de-servicio', // detectar-secretos:permitir (valor de prueba)
  SAL_IP: 'sal',
} as Env;

const USUARIO = '11111111-2222-4333-8444-555555555555';

const peticion = (conSesion = true, ip = '203.0.113.7') =>
  new Request('https://hidrantes-albolote.pages.dev/api/vincular-jefatura', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': ip,
      ...(conSesion ? { Authorization: 'Bearer a.b.c' } : {}),
    },
    body: '{}',
  });

const google = (email: string, ...v: unknown[]) => ({
  provider: 'google',
  identity_data: { email, email_verified: v.length ? v[0] : true },
});

const conCorreo = (email: string, provider = 'email', verificado: unknown = true) => ({
  provider,
  identity_data: { email, email_verified: verificado },
});

interface Red {
  /** Lo que contesta GET /auth/v1/user. */
  usuario?: Response | Error;
  /** Lo que contesta fn_vincular_administrador. */
  vincular?: Response | Error;
  /** Lo que contesta POST /auth/v1/logout?scope=others (docs/36 RV-450). */
  cerrarOtras?: Response | Error;
  /** Lo que contesta fn_desvincular_administrador. */
  desvincular?: Response | Error;
}

const usuarioAuth = (cuerpo: Record<string, unknown>) =>
  new Response(JSON.stringify({ id: USUARIO, ...cuerpo }), { status: 200 });

function fingirRed({
  usuario = usuarioAuth({ email: 'jefa@example.com', identities: [google('jefa@example.com')] }),
  vincular = new Response('"VINCULADO"'),
  cerrarOtras = new Response(null, { status: 204 }),
  desvincular = new Response('true'),
}: Red = {}) {
  const llamadas: { url: string; cuerpo: unknown; autorizacion: string | null }[] = [];
  const espia = vi.spyOn(globalThis, 'fetch').mockImplementation((entrada, opciones) => {
    const url = String(entrada);
    const init = opciones as RequestInit | undefined;
    const cuerpo = init?.body;
    llamadas.push({
      url,
      cuerpo: typeof cuerpo === 'string' ? JSON.parse(cuerpo) : cuerpo,
      autorizacion: new Headers(init?.headers).get('Authorization'),
    });
    const r = url.endsWith('/auth/v1/user')
      ? usuario
      : url.endsWith('/auth/v1/logout?scope=others')
        ? cerrarOtras
        : url.includes('/rpc/fn_vincular_administrador')
          ? vincular
          : url.includes('/rpc/fn_desvincular_administrador')
            ? desvincular
            : url.includes('/rpc/fn_registrar_error')
              ? new Response('', { status: 204 })
              : null;
    if (r === null) return Promise.resolve(new Response('null', { status: 404 }));
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r.clone());
  });
  return { espia, llamadas };
}

const llamoALaRpc = (llamadas: { url: string }[]) => llamadas.some((l) => l.url.includes('fn_vincular_administrador'));
const cerroOtras = <L extends { url: string }>(llamadas: L[]) =>
  llamadas.filter((l) => l.url.includes('/auth/v1/logout'));
const desvinculo = <L extends { url: string }>(llamadas: L[]) =>
  llamadas.filter((l) => l.url.includes('/rpc/fn_desvincular_administrador'));
/** Lo que se anotó en errores_cliente (el mensaje), si se anotó algo. */
const anotado = (llamadas: { url: string; cuerpo: unknown }[]) =>
  llamadas
    .filter((l) => l.url.includes('/rpc/fn_registrar_error'))
    .map((l) => (l.cuerpo as { mensaje: string; ip_hash: string }).mensaje);

let errores: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  _reiniciarLimites();
  errores = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/vincular-jefatura', () => {
  it('bien: lee el usuario con el JWT de la sesión y llama a la RPC con el correo de la identidad de Google', async () => {
    const { llamadas } = fingirRed();
    const r = await onRequestPost({ request: peticion(), env: ENV });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ resultado: 'VINCULADO' });
    const auth = llamadas.find((l) => l.url.endsWith('/auth/v1/user'))!;
    expect(auth.autorizacion).toBe('Bearer a.b.c');
    const rpc = llamadas.find((l) => l.url.includes('/rpc/fn_vincular_administrador'))!;
    expect(rpc.cuerpo).toEqual({ usuario: USUARIO, correo: 'jefa@example.com' });
    // Con service_role, no con el JWT de quien llama.
    expect(rpc.autorizacion).toBe('Bearer clave-de-servicio');
  });

  it('sin acceso en la base de datos → 403 con su código, y no se cierra ninguna sesión', async () => {
    const { llamadas } = fingirRed({ vincular: new Response('"NO_ES_ADMINISTRADOR"') });
    const r = await onRequestPost({ request: peticion(), env: ENV });
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'NO_ES_ADMINISTRADOR' });
    expect(cerroOtras(llamadas)).toEqual([]);
  });

  // docs/36 RV-450 (DEC-206): solo se une una cuenta cuyas identidades llevan todas el mismo correo
  // verificado, que además es el de la cuenta.
  describe('una cuenta con otra identidad unida (docs/36 RV-450)', () => {
    it.each([
      [
        'dos identidades de Google con correos distintos',
        { email: 'jefa@example.com', identities: [google('otra.persona@example.org'), google('jefa@example.com')] },
      ],
      [
        'el correo de la cuenta distinto del de su identidad de Google',
        { email: 'otra.persona@example.org', identities: [google('jefa@example.com')] },
      ],
      ['la cuenta sin correo', { identities: [google('jefa@example.com')] }],
      [
        'otra identidad con el mismo correo sin verificar',
        {
          email: 'jefa@example.com',
          identities: [conCorreo('jefa@example.com', 'email', false), google('jefa@example.com')],
        },
      ],
      [
        'otra identidad sin correo',
        {
          email: 'jefa@example.com',
          identities: [{ provider: 'phone', identity_data: {} }, google('jefa@example.com')],
        },
      ],
      [
        'otra identidad de otro proveedor con otro correo',
        {
          email: 'jefa@example.com',
          identities: [google('jefa@example.com'), conCorreo('otra.persona@example.org', 'github')],
        },
      ],
    ])('%s → 403 CUENTA_MEZCLADA, sin unir y anotado sin datos', async (_, cuerpo) => {
      const { llamadas } = fingirRed({ usuario: usuarioAuth(cuerpo) });
      const r = await onRequestPost({ request: peticion(), env: ENV });
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({ error: 'CUENTA_MEZCLADA' });
      expect(llamoALaRpc(llamadas)).toBe(false);
      expect(cerroOtras(llamadas)).toEqual([]);
      expect(anotado(llamadas)).toEqual(['vincular_jefatura: cuenta con otra identidad']);
      const escrito = JSON.stringify(llamadas.map((l) => l.cuerpo));
      expect(escrito).not.toContain('example');
      expect(escrito).not.toContain(USUARIO);
    });

    it('una identidad de correo y contraseña con el mismo correo, más la de Google → une', async () => {
      const { llamadas } = fingirRed({
        usuario: usuarioAuth({
          email: 'Jefa@Example.com',
          identities: [conCorreo(' jefa@example.com '), google('JEFA@example.com')],
        }),
      });
      const r = await onRequestPost({ request: peticion(), env: ENV });
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ resultado: 'VINCULADO' });
      const rpc = llamadas.find((l) => l.url.includes('/rpc/fn_vincular_administrador'))!;
      expect(rpc.cuerpo).toEqual({ usuario: USUARIO, correo: 'jefa@example.com' });
    });
  });

  describe('tras unir, las demás sesiones se cierran (docs/36 RV-450)', () => {
    it('VINCULADO → cierra las demás sesiones de ese usuario con el JWT de esta', async () => {
      const { llamadas } = fingirRed();
      const r = await onRequestPost({ request: peticion(), env: ENV });
      expect(r.status).toBe(200);
      const cierre = cerroOtras(llamadas);
      expect(cierre).toHaveLength(1);
      expect(cierre[0]!.url).toBe('https://proyecto.supabase.co/auth/v1/logout?scope=others');
      expect(cierre[0]!.autorizacion).toBe('Bearer a.b.c');
      // Primero la unión, después el cierre.
      expect(llamadas.findIndex((l) => l.url.includes('/auth/v1/logout'))).toBeGreaterThan(
        llamadas.findIndex((l) => l.url.includes('fn_vincular_administrador')),
      );
      expect(desvinculo(llamadas)).toEqual([]);
    });

    it('YA_VINCULADO → no cierra nada', async () => {
      const { llamadas } = fingirRed({ vincular: new Response('"YA_VINCULADO"') });
      expect((await onRequestPost({ request: peticion(), env: ENV })).status).toBe(200);
      expect(cerroOtras(llamadas)).toEqual([]);
    });

    it.each([
      ['un 500', new Response('{}', { status: 500 }), 'vincular_jefatura: cierre de sesiones 500'],
      ['un 401', new Response('{}', { status: 401 }), 'vincular_jefatura: cierre de sesiones 401'],
      ['sin red', new Error('red'), 'vincular_jefatura: cierre de sesiones red'],
    ])('si el cierre falla con %s, se deshace la unión y 503', async (_, cerrarOtras, mensaje) => {
      const { llamadas } = fingirRed({ cerrarOtras });
      const r = await onRequestPost({ request: peticion(), env: ENV });
      expect(r.status).toBe(503);
      expect(await r.json()).toEqual({ error: 'SERVIDOR_NO_DISPONIBLE' });
      const deshacer = desvinculo(llamadas);
      expect(deshacer).toHaveLength(1);
      expect(deshacer[0]!.cuerpo).toEqual({ correo: 'jefa@example.com' });
      expect(deshacer[0]!.autorizacion).toBe('Bearer clave-de-servicio');
      expect(anotado(llamadas)).toEqual([mensaje]);
    });

    it('si tampoco se puede deshacer, 503 y los dos fallos anotados', async () => {
      const { llamadas } = fingirRed({
        cerrarOtras: new Response('{}', { status: 500 }),
        desvincular: new Response('{}', { status: 503 }),
      });
      expect((await onRequestPost({ request: peticion(), env: ENV })).status).toBe(503);
      expect(anotado(llamadas)).toEqual([
        'vincular_jefatura: cierre de sesiones 500',
        'vincular_jefatura: unión sin deshacer, rpc ERROR_INTERNO 503',
      ]);
    });
  });

  it('sin identidad de Google → 403 y no llama a la RPC', async () => {
    const { llamadas } = fingirRed({
      usuario: usuarioAuth({
        email: 'jefa@example.com',
        identities: [{ provider: 'email', identity_data: { email: 'jefa@example.com', email_verified: true } }],
      }),
    });
    const r = await onRequestPost({ request: peticion(), env: ENV });
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'SIN_GOOGLE' });
    expect(llamoALaRpc(llamadas)).toBe(false);
  });

  it.each([false, 'true', undefined, null])('email_verified = %s → 403 y no llama a la RPC', async (verificado) => {
    const { llamadas } = fingirRed({
      usuario: usuarioAuth({ email: 'jefa@example.com', identities: [google('jefa@example.com', verificado)] }),
    });
    const r = await onRequestPost({ request: peticion(), env: ENV });
    expect(r.status).toBe(403);
    expect(llamoALaRpc(llamadas)).toBe(false);
  });

  it('OTRA_CUENTA → 403 con su código', async () => {
    fingirRed({ vincular: new Response('"OTRA_CUENTA"') });
    const r = await onRequestPost({ request: peticion(), env: ENV });
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'OTRA_CUENTA' });
  });

  it('YA_VINCULADO → 200', async () => {
    fingirRed({ vincular: new Response('"YA_VINCULADO"') });
    const r = await onRequestPost({ request: peticion(), env: ENV });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ resultado: 'YA_VINCULADO' });
  });

  it('desde otra web → 403 ORIGEN_NO_PERMITIDO y no pregunta a nadie (docs/35 RV-401)', async () => {
    const { llamadas } = fingirRed();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ajena = new Request('https://hidrantes-albolote.pages.dev/api/vincular-jefatura', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://otra.example', Authorization: 'Bearer a.b.c' },
      body: '{}',
    });
    const r = await onRequestPost({ request: ajena, env: ENV });
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'ORIGEN_NO_PERMITIDO' });
    expect(llamadas).toHaveLength(0);
  });

  it('sin JWT → 401 y no pregunta a nadie', async () => {
    const { llamadas } = fingirRed();
    const r = await onRequestPost({ request: peticion(false), env: ENV });
    expect(r.status).toBe(401);
    expect(llamadas).toHaveLength(0);
  });

  it.each([401, 403])('Supabase Auth responde %i al JWT → 401 sin acceso, sin anotar nada', async (estado) => {
    const { llamadas } = fingirRed({ usuario: new Response('{"msg":"invalid JWT"}', { status: estado }) });
    const r = await onRequestPost({ request: peticion(), env: ENV });
    expect(r.status).toBe(401);
    expect(llamoALaRpc(llamadas)).toBe(false);
    expect(anotado(llamadas)).toEqual([]);
  });

  it.each([
    ['429', new Response('{}', { status: 429 }), 'vincular_jefatura: auth 429'],
    ['404', new Response('{}', { status: 404 }), 'vincular_jefatura: auth 404'],
    ['503', new Response('{}', { status: 503 }), 'vincular_jefatura: auth 503'],
    ['sin red', new Error('red'), 'vincular_jefatura: auth red'],
    ['200 sin JSON', new Response('<html>', { status: 200 }), 'vincular_jefatura: auth respuesta no JSON'],
  ])('Supabase Auth con %s → 503, no «sin acceso», y queda anotado', async (_, usuario, mensaje) => {
    const { llamadas } = fingirRed({ usuario });
    const r = await onRequestPost({ request: peticion(), env: ENV });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'SERVIDOR_NO_DISPONIBLE' });
    expect(llamoALaRpc(llamadas)).toBe(false);
    expect(anotado(llamadas)).toEqual([mensaje]);
    const registro = llamadas.find((l) => l.url.includes('/rpc/fn_registrar_error'))!;
    expect(registro.cuerpo).toMatchObject({ ip_hash: 'funcion:vincular_jefatura', ruta: '/api/vincular-jefatura' });
  });

  it('sin SUPABASE_URL (mal configurado) → 503 anotado', async () => {
    const { llamadas } = fingirRed({ usuario: new TypeError('URL no válida') });
    const r = await onRequestPost({ request: peticion(), env: { ...ENV, SUPABASE_URL: undefined } as unknown as Env });
    expect(r.status).toBe(503);
    expect(anotado(llamadas)).toEqual(['vincular_jefatura: auth red']);
  });

  it('Auth devuelve un usuario sin id válido → 500 anotado, no 401', async () => {
    const { llamadas } = fingirRed({
      usuario: new Response(JSON.stringify({ id: 'x', identities: [google('jefa@example.com')] })),
    });
    const r = await onRequestPost({ request: peticion(), env: ENV });
    expect(r.status).toBe(500);
    expect(llamoALaRpc(llamadas)).toBe(false);
    expect(anotado(llamadas)).toEqual(['vincular_jefatura: auth usuario sin id']);
  });

  it('una identidad de Google sin correo verificado se anota, sin el correo; sin ninguna, no', async () => {
    let red = fingirRed({ usuario: usuarioAuth({ identities: [google('jefa@example.com', 'true')] }) });
    expect((await onRequestPost({ request: peticion(), env: ENV })).status).toBe(403);
    expect(anotado(red.llamadas)).toEqual(['vincular_jefatura: identidad de Google sin correo verificado']);
    vi.mocked(globalThis.fetch).mockRestore();
    red = fingirRed({ usuario: usuarioAuth({ identities: [] }) });
    expect((await onRequestPost({ request: peticion(), env: ENV })).status).toBe(403);
    expect(anotado(red.llamadas)).toEqual([]);
  });

  it('la base de datos sin responder → 503 anotado con código y estado', async () => {
    const { llamadas } = fingirRed({ vincular: new Error('red') });
    expect((await onRequestPost({ request: peticion(), env: ENV })).status).toBe(503);
    expect(anotado(llamadas)).toEqual(['vincular_jefatura: rpc SERVIDOR_NO_DISPONIBLE 503']);
  });

  it.each([
    ['un resultado desconocido', new Response('"OTRA_COSA"'), 'vincular_jefatura: rpc resultado inesperado'],
    ['un 200 que no es JSON', new Response('<html>'), 'vincular_jefatura: rpc respuesta no JSON'],
    ['un error 400', new Response('{"code":"XX000"}', { status: 400 }), 'vincular_jefatura: rpc ERROR_INTERNO 400'],
  ])('la RPC con %s → 500 anotado', async (_, vincular, mensaje) => {
    const { llamadas } = fingirRed({ vincular });
    expect((await onRequestPost({ request: peticion(), env: ENV })).status).toBe(500);
    expect(anotado(llamadas)).toEqual([mensaje]);
  });

  it('si ni siquiera se puede anotar, queda en el registro del Worker', async () => {
    const espia = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('red'));
    expect((await onRequestPost({ request: peticion(), env: ENV })).status).toBe(503);
    expect(errores).toHaveBeenCalledWith('vincular_jefatura: auth red (sin anotar)');
    espia.mockRestore();
  });

  it('nunca escribe el correo ni el usuario en el registro de la Function ni en lo anotado', async () => {
    const avisos = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { llamadas } = fingirRed({
      vincular: new Response('{"code":"XX000","message":"jefa@example.com"}', { status: 500 }),
    });
    await onRequestPost({ request: peticion(), env: ENV });
    const escrito = JSON.stringify([...errores.mock.calls, ...avisos.mock.calls, anotado(llamadas)]);
    expect(escrito).not.toContain('jefa@example.com');
    expect(escrito).not.toContain(USUARIO);
  });

  it('más de 30 por minuto desde la misma IP → 429', async () => {
    fingirRed();
    for (let i = 0; i < 30; i++) expect((await onRequestPost({ request: peticion(), env: ENV })).status).toBe(200);
    expect((await onRequestPost({ request: peticion(), env: ENV })).status).toBe(429);
    expect((await onRequestPost({ request: peticion(true, '198.51.100.1'), env: ENV })).status).toBe(200);
  });
});

describe('correoDeGoogle', () => {
  it('toma la identidad de Google verificada, en minúsculas, aunque haya otras', () => {
    expect(
      correoDeGoogle({
        identities: [
          { provider: 'email', identity_data: { email: 'x@example.com', email_verified: true } },
          google(' Jefa@Example.COM '),
        ],
      }),
    ).toBe('jefa@example.com');
  });

  it('sin identities, o con una forma rara, null', () => {
    expect(correoDeGoogle({})).toBeNull();
    expect(correoDeGoogle({ identities: 'google' })).toBeNull();
    expect(correoDeGoogle({ identities: [null, { provider: 'google' }, google('sin-arroba')] })).toBeNull();
  });
});
