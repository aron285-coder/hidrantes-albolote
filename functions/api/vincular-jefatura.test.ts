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

interface Red {
  /** Lo que contesta GET /auth/v1/user. */
  usuario?: Response | Error;
  /** Lo que contesta fn_vincular_administrador. */
  vincular?: Response | Error;
}

const usuarioAuth = (cuerpo: Record<string, unknown>) =>
  new Response(JSON.stringify({ id: USUARIO, ...cuerpo }), { status: 200 });

function fingirRed({
  usuario = usuarioAuth({ email: 'jefa@example.com', identities: [google('jefa@example.com')] }),
  vincular = new Response('"VINCULADO"'),
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
      : url.includes('/rpc/fn_vincular_administrador')
        ? vincular
        : null;
    if (r === null) return Promise.resolve(new Response('null', { status: 404 }));
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r.clone());
  });
  return { espia, llamadas };
}

const llamoALaRpc = (llamadas: { url: string }[]) => llamadas.some((l) => l.url.includes('fn_vincular_administrador'));

beforeEach(() => _reiniciarLimites());
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

  it('el correo de la cuenta distinto del de su identidad de Google: cuenta el de Google, y sin acceso → 403', async () => {
    const { llamadas } = fingirRed({
      usuario: usuarioAuth({ email: 'jefa@example.com', identities: [google('otra.persona@example.org')] }),
      vincular: new Response('"NO_ES_ADMINISTRADOR"'),
    });
    const r = await onRequestPost({ request: peticion(), env: ENV });
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'NO_ES_ADMINISTRADOR' });
    const rpc = llamadas.find((l) => l.url.includes('/rpc/fn_vincular_administrador'))!;
    expect(rpc.cuerpo).toEqual({ usuario: USUARIO, correo: 'otra.persona@example.org' });
    expect(JSON.stringify(llamadas.map((l) => l.cuerpo))).not.toContain('jefa@example.com');
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

  it('sin JWT → 401 y no pregunta a nadie', async () => {
    const { llamadas } = fingirRed();
    const r = await onRequestPost({ request: peticion(false), env: ENV });
    expect(r.status).toBe(401);
    expect(llamadas).toHaveLength(0);
  });

  it('JWT que Supabase Auth no acepta → 401 y no llama a la RPC', async () => {
    const { llamadas } = fingirRed({ usuario: new Response('{"msg":"invalid JWT"}', { status: 401 }) });
    const r = await onRequestPost({ request: peticion(), env: ENV });
    expect(r.status).toBe(401);
    expect(llamoALaRpc(llamadas)).toBe(false);
  });

  it('Supabase Auth sin responder → 503', async () => {
    fingirRed({ usuario: new Error('red') });
    const r = await onRequestPost({ request: peticion(), env: ENV });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'SERVIDOR_NO_DISPONIBLE' });
  });

  it('la base de datos sin responder → 503; una respuesta rara → 500', async () => {
    fingirRed({ vincular: new Error('red') });
    expect((await onRequestPost({ request: peticion(), env: ENV })).status).toBe(503);
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fingirRed({ vincular: new Response('"OTRA_COSA"') });
    expect((await onRequestPost({ request: peticion(), env: ENV })).status).toBe(500);
  });

  it('nunca escribe el correo ni el usuario en el registro de la Function', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {});
    const avisos = vi.spyOn(console, 'log').mockImplementation(() => {});
    fingirRed({ vincular: new Response('{"code":"XX000","message":"jefa@example.com"}', { status: 500 }) });
    await onRequestPost({ request: peticion(), env: ENV });
    const escrito = JSON.stringify([...errores.mock.calls, ...avisos.mock.calls]);
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
