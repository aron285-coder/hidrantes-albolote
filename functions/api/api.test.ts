// Contrato HTTP de las Pages Functions (05 §9) con fetch simulado. La integración real contra
// Supabase local y `wrangler pages dev` la hace scripts/probar-functions.ts en la CI.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../_lib/comun.ts';
import { bucketPara, estadoDe } from '../_lib/comun.ts';
import { formatearDireccion } from '../_lib/nominatim.ts';
import { onRequestGet as direccion } from './direccion.ts';
import { onRequestPost as lanzarWorkflow } from './lanzar-workflow.ts';
import { onRequestPost as push } from './push.ts';
import { onRequestPost as urlSubida } from './url-subida.ts';
import { DURACION_MINIMA_MS, onRequestPost as verificarCodigo } from './verificar-codigo.ts';

const env: Env = {
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-servicio',
  SAL_IP: 'sal',
};
const JWT = 'aaa.bbb.ccc';

type Manejador = (url: string, init: RequestInit) => Response | Promise<Response>;

function simularFetch(manejador: Manejador) {
  const f = vi.fn(async (entrada: RequestInfo | URL, init: RequestInit = {}) => manejador(String(entrada), init));
  vi.stubGlobal('fetch', f);
  return f;
}

const respuesta = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const llamar = (fn: any, request: Request, e: Env = env) => fn({ request, env: e }) as Promise<Response>;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('POST /api/verificar-codigo', () => {
  const pedir = (cuerpo: unknown, ip = '203.0.113.7') =>
    new Request('https://hidrantes-albolote.pages.dev/api/verificar-codigo', {
      method: 'POST',
      body: JSON.stringify(cuerpo),
      headers: { 'CF-Connecting-IP': ip },
    });
  const dispositivo = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

  it('código correcto: 200 con token, e ip_hash en lugar de la IP', async () => {
    const f = simularFetch(() => respuesta([{ token: 'tok', caduca_en: '2027-09-19T00:00:00Z', error: null }]));
    const r = await llamar(verificarCodigo, pedir({ codigo: '482917', dispositivo_id: dispositivo }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ token: 'tok', caduca_en: '2027-09-19T00:00:00Z' });
    const cuerpo = JSON.parse(String(f.mock.calls[0][1]?.body));
    expect(cuerpo.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(cuerpo)).not.toContain('203.0.113.7');
  });

  it('código incorrecto: 401', async () => {
    simularFetch(() => respuesta([{ token: null, caduca_en: null, error: 'CODIGO_INCORRECTO' }]));
    const r = await llamar(verificarCodigo, pedir({ codigo: '000000', dispositivo_id: dispositivo }));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: 'CODIGO_INCORRECTO' });
  });

  it('demasiados intentos: 429 con reintentar_en_s', async () => {
    simularFetch(() => respuesta([{ token: null, caduca_en: null, error: 'DEMASIADOS_INTENTOS' }]));
    const r = await llamar(verificarCodigo, pedir({ codigo: '000000', dispositivo_id: dispositivo }));
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: 'DEMASIADOS_INTENTOS', reintentar_en_s: 3600 });
  });

  it('dispositivo_id que no es uuid: 400 sin llamar a la base de datos', async () => {
    const f = simularFetch(() => respuesta([]));
    const r = await llamar(verificarCodigo, pedir({ codigo: '000000', dispositivo_id: 'x' }));
    expect(r.status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it('tarda al menos la duración mínima, acierte o falle (TR-42)', async () => {
    simularFetch(() => respuesta([{ token: null, caduca_en: null, error: 'CODIGO_INCORRECTO' }]));
    const t0 = Date.now();
    await llamar(verificarCodigo, pedir({ codigo: '000000', dispositivo_id: dispositivo }));
    expect(Date.now() - t0).toBeGreaterThanOrEqual(DURACION_MINIMA_MS - 20);
  });
});

describe('POST /api/url-subida', () => {
  const pedir = (
    cuerpo: unknown,
    cabeceras: Record<string, string> = {},
    host = 'hidrantes-albolote-staging.pages.dev',
  ) =>
    new Request(`https://${host}/api/url-subida`, { method: 'POST', body: JSON.stringify(cuerpo), headers: cabeceras });

  it('voluntario: reserva y devuelve la URL firmada del bucket del entorno', async () => {
    const f = simularFetch((url) =>
      url.includes('/rpc/fn_reservar_subida')
        ? respuesta('fotos/abc.jpg')
        : respuesta({ url: '/object/upload/sign/hidrantes-fotos-dev/fotos/abc.jpg?token=t' }),
    );
    const r = await llamar(urlSubida, pedir({ token: 'x'.repeat(43) }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      foto_path: 'fotos/abc.jpg',
      url: 'https://proyecto.supabase.co/storage/v1/object/upload/sign/hidrantes-fotos-dev/fotos/abc.jpg?token=t',
      caduca_en_s: 7200,
    });
    expect(String(f.mock.calls[1][0])).toContain('/upload/sign/hidrantes-fotos-dev/fotos/abc.jpg');
  });

  it('cuota agotada: 429', async () => {
    simularFetch(() => respuesta({ code: 'P0001', message: 'CUOTA_SUBIDAS_AGOTADA: Has llegado al máximo' }, 400));
    const r = await llamar(urlSubida, pedir({ token: 'x'.repeat(43) }));
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: 'CUOTA_SUBIDAS_AGOTADA' });
  });

  it('token inválido: 401', async () => {
    simularFetch(() => respuesta({ code: 'P0001', message: 'TOKEN_INVALIDO: Acceso no válido' }, 400));
    expect((await llamar(urlSubida, pedir({ token: 'x'.repeat(43) }))).status).toBe(401);
  });

  it('jefatura: reserva con su JWT', async () => {
    const f = simularFetch((url) =>
      url.includes('/rpc/')
        ? respuesta('fotos/j.jpg')
        : respuesta({ url: '/object/upload/sign/b/fotos/j.jpg?token=t' }),
    );
    const r = await llamar(urlSubida, pedir({}, { Authorization: `Bearer ${JWT}` }));
    expect(r.status).toBe(200);
    expect(String(f.mock.calls[0][0])).toContain('/rpc/fn_reservar_subida_admin');
    expect((f.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe(`Bearer ${JWT}`);
  });

  it('sin token ni sesión: 401 sin llamar a nada', async () => {
    const f = simularFetch(() => respuesta(null));
    expect((await llamar(urlSubida, pedir({}))).status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('GET /api/direccion', () => {
  const pedir = (q: string, jwt?: string) =>
    new Request(`https://hidrantes-albolote.pages.dev/api/direccion?${q}`, {
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
    });

  it('sin JWT: 403 (TR-40)', async () => {
    const f = simularFetch(() => respuesta(true));
    const r = await llamar(direccion, pedir('lat=37.23&lng=-3.65'));
    expect(r.status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });

  it('con JWT de alguien que no es administrador: 403', async () => {
    simularFetch(() => respuesta(false));
    expect((await llamar(direccion, pedir('lat=37.23&lng=-3.65', JWT))).status).toBe(403);
  });

  it('administrador: pregunta a Nominatim con User-Agent y guarda la dirección', async () => {
    const f = simularFetch((url) => {
      if (url.includes('fn_es_admin')) return respuesta(true);
      if (url.includes('v_cola_revision')) return respuesta([{ direccion_sugerida: null }]);
      if (url.includes('nominatim'))
        return respuesta({ address: { road: 'Calle Real', house_number: '14', town: 'Albolote' } });
      return respuesta(null);
    });
    const r = await llamar(
      direccion,
      pedir('lat=37.23&lng=-3.65&propuesta_id=6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b', JWT),
      { ...env, NOMINATIM_USER_AGENT: 'hidrantes-test' },
    );
    expect(await r.json()).toEqual({ direccion: 'Calle Real 14, Albolote', fuente: 'nominatim', cacheada: false });
    const nominatim = f.mock.calls.find(([u]) => String(u).includes('nominatim'))!;
    expect((nominatim[1]?.headers as Record<string, string>)['User-Agent']).toBe('hidrantes-test');
    expect(f.mock.calls.some(([u]) => String(u).includes('fn_guardar_direccion_sugerida'))).toBe(true);
  });

  it('Nominatim no responde: 200 con dirección vacía, nunca bloquea (FR-15)', async () => {
    simularFetch((url) => (url.includes('fn_es_admin') ? respuesta(true) : respuesta({}, 503)));
    const r = await llamar(direccion, pedir('lat=37.23&lng=-3.65', JWT));
    expect(await r.json()).toEqual({ direccion: null, fuente: 'nominatim', motivo: 'sin_respuesta' });
  });

  it('coordenadas fuera de la provincia: 400', async () => {
    simularFetch(() => respuesta(true));
    expect((await llamar(direccion, pedir('lat=40.4&lng=-3.7', JWT))).status).toBe(400);
  });
});

describe('POST /api/lanzar-workflow', () => {
  const pedir = (cuerpo: unknown, jwt: string | null = JWT) =>
    new Request('https://hidrantes-albolote.pages.dev/api/lanzar-workflow', {
      method: 'POST',
      body: JSON.stringify(cuerpo),
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
    });

  it('sin sesión de administrador: 403', async () => {
    simularFetch(() => respuesta(false));
    expect((await llamar(lanzarWorkflow, pedir({ workflow: 'respaldo' }, null))).status).toBe(403);
  });

  it('workflow fuera de la lista blanca: 400', async () => {
    simularFetch(() => respuesta(true));
    expect((await llamar(lanzarWorkflow, pedir({ workflow: 'deploy-prod' }))).status).toBe(400);
  });

  it('sin GITHUB_DISPATCH_TOKEN: 503 NO_CONFIGURADO', async () => {
    simularFetch(() => respuesta(true));
    const r = await llamar(lanzarWorkflow, pedir({ workflow: 'regenerar-zona' }));
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'NO_CONFIGURADO' });
  });

  it('trabajo sin workflow todavía (la purga de fotos, Fase 8): 503 NO_CONFIGURADO', async () => {
    const f = simularFetch((url) =>
      url.includes('api.github.com') ? new Response(null, { status: 204 }) : respuesta(true),
    );
    const r = await llamar(lanzarWorkflow, pedir({ workflow: 'purgar-fotos' }), {
      ...env,
      GITHUB_DISPATCH_TOKEN: 'gh',
    });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'NO_CONFIGURADO' });
    // Y no se ha llamado a GitHub: nada que despachar.
    expect(f.mock.calls.some(([u]) => String(u).includes('api.github.com'))).toBe(false);
  });

  it('con token: workflow_dispatch sobre mantenimiento.yml en develop y 202 (DEC-069)', async () => {
    const f = simularFetch((url) =>
      url.includes('api.github.com') ? new Response(null, { status: 204 }) : respuesta(true),
    );
    const r = await llamar(lanzarWorkflow, pedir({ workflow: 'regenerar-zona' }), {
      ...env,
      GITHUB_DISPATCH_TOKEN: 'gh',
    });
    expect(r.status).toBe(202);
    const gh = f.mock.calls.find(([u]) => String(u).includes('api.github.com'))!;
    // El endpoint de workflow_dispatch basta con actions:write; el de repository_dispatch exigiría
    // contents:write, que además dejaría empujar a develop.
    expect(String(gh[0])).toBe(
      'https://api.github.com/repos/aron285-coder/hidrantes-albolote/actions/workflows/mantenimiento.yml/dispatches',
    );
    expect(JSON.parse(String(gh[1]?.body))).toEqual({ ref: 'develop', inputs: { trabajo: 'regenerar-zona' } });
  });

  it('el respaldo va a su propio workflow y sin entradas: GitHub rechaza las que no existen', async () => {
    const f = simularFetch((url) =>
      url.includes('api.github.com') ? new Response(null, { status: 204 }) : respuesta(true),
    );
    const r = await llamar(lanzarWorkflow, pedir({ workflow: 'respaldo' }), { ...env, GITHUB_DISPATCH_TOKEN: 'gh' });
    expect(r.status).toBe(202);
    const gh = f.mock.calls.find(([u]) => String(u).includes('api.github.com'))!;
    expect(String(gh[0])).toContain('/actions/workflows/respaldo.yml/dispatches');
    expect(JSON.parse(String(gh[1]?.body))).toEqual({ ref: 'develop' });
  });
});

describe('POST /api/push', () => {
  it('sin credencial: 401', async () => {
    simularFetch(() => respuesta({ code: 'P0001', message: 'TOKEN_INVALIDO: x' }, 400));
    const r = await llamar(push, new Request('https://x/api/push', { method: 'POST', body: '{}' }));
    expect(r.status).toBe(401);
  });

  it('sin claves VAPID configuradas: 503 NO_CONFIGURADO', async () => {
    simularFetch(() => respuesta(true));
    const r = await llamar(
      push,
      new Request('https://x/api/push', { method: 'POST', headers: { Authorization: `Bearer ${JWT}` } }),
    );
    expect(r.status).toBe(503);
  });

  it('nada pendiente: 200 con cero envíos', async () => {
    simularFetch((url) => (url.includes('fn_reclamar_notificaciones') ? respuesta([]) : respuesta(true)));
    const r = await llamar(
      push,
      new Request('https://x/api/push', { method: 'POST', headers: { 'X-Vigilancia': 'secreto' } }),
      {
        ...env,
        VIGILANCIA_SECRETO: 'secreto',
        VAPID_PUBLIC_KEY: 'p',
        VAPID_PRIVATE_KEY: 'd',
        VAPID_SUBJECT: 'https://x',
      },
    );
    expect(await r.json()).toEqual({ enviadas: 0, fallidas: 0 });
  });
});

describe('utilidades', () => {
  it('bucket por dominio: producción solo en el de producción (04 §4)', () => {
    expect(bucketPara('https://hidrantes-albolote.pages.dev/api/x', {})).toBe('hidrantes-fotos');
    expect(bucketPara('https://hidrantes-albolote-staging.pages.dev/api/x', {})).toBe('hidrantes-fotos-dev');
    expect(bucketPara('https://abc123.hidrantes-albolote.pages.dev/api/x', {})).toBe('hidrantes-fotos-dev');
    expect(bucketPara('http://localhost:8788/api/x', {})).toBe('hidrantes-fotos-dev');
  });

  it.each([
    ['TOKEN_REVOCADO', 401],
    ['NO_AUTORIZADO', 403],
    ['CUOTA_INCIDENCIAS_AGOTADA', 429],
    ['PAYLOAD_INVALIDO(datos)', 400],
    ['SERVIDOR_NO_DISPONIBLE', 503],
  ])('%s → HTTP %i', (codigo, estado) => expect(estadoDe(codigo)).toBe(estado));

  it('formatea la dirección de Nominatim', () => {
    expect(formatearDireccion({ address: { road: 'Calle Real', house_number: '14', town: 'Albolote' } })).toBe(
      'Calle Real 14, Albolote',
    );
    expect(formatearDireccion({ address: { road: 'Camino del Cubillas', village: 'Albolote' } })).toBe(
      'Camino del Cubillas, Albolote',
    );
    expect(formatearDireccion({ address: {} })).toBeNull();
  });
});
