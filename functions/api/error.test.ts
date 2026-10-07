// Los errores del cliente (TR-90, TR-106, RV-148). La Function es la única que ve la IP real: la
// guarda como sha256(SAL_IP + ip normalizada), igual que el canje del código, para que el tope por IP
// de fn_registrar_error (0040) no se salte rotando dispositivo_id. Nunca guarda la IP en claro.

import { describe, expect, it, vi } from 'vitest';
import { type Env, normalizarIp, sha256Hex } from '../_lib/comun.ts';
import { onRequestPost } from './error.ts';

const ENV = {
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-de-servicio', // detectar-secretos:permitir (valor de prueba)
  SAL_IP: 'sal-larga-de-pruebas', // detectar-secretos:permitir (valor de prueba)
} as Env;

const DISPOSITIVO = '0f1e2d3c-4b5a-4968-8776-6a5b4c3d2e1f';

const peticion = (cuerpo: unknown, ip: string | null = '203.0.113.7') =>
  new Request('https://hidrantes-albolote-staging.pages.dev/api/error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(ip ? { 'CF-Connecting-IP': ip } : {}) },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  });

const bueno = {
  dispositivo_id: DISPOSITIVO,
  mensaje: 'TypeError: x is undefined',
  pila: 'at f (app.js:1:2)',
  ruta: '/mapa',
  agente: 'Mozilla/5.0',
};

function fingirRed(respuesta: Response | Error = new Response('')) {
  const llamadas: { url: string; cuerpo: Record<string, unknown>; autorizacion: string | null }[] = [];
  const espia = vi.spyOn(globalThis, 'fetch').mockImplementation((entrada, opciones) => {
    const init = opciones as RequestInit;
    llamadas.push({
      url: String(entrada),
      cuerpo: JSON.parse(init.body as string) as Record<string, unknown>,
      autorizacion: new Headers(init.headers).get('Authorization'),
    });
    return respuesta instanceof Error ? Promise.reject(respuesta) : Promise.resolve(respuesta.clone());
  });
  return { espia, llamadas };
}

describe('POST /api/error', () => {
  it('anota el error con la firma de seis argumentos, con service_role y la IP cifrada', async () => {
    const { espia, llamadas } = fingirRed();
    const r = await onRequestPost({ request: peticion(bueno), env: ENV });

    expect(r.status).toBe(204);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]!.url).toBe('https://proyecto.supabase.co/rest/v1/rpc/fn_registrar_error');
    expect(llamadas[0]!.autorizacion).toBe('Bearer clave-de-servicio');
    expect(llamadas[0]!.cuerpo).toEqual({
      ...bueno,
      ip_hash: await sha256Hex('sal-larga-de-pruebas' + '203.0.113.7'),
    });
    expect(JSON.stringify(llamadas[0]!.cuerpo)).not.toContain('203.0.113.7');
    espia.mockRestore();
  });

  it('con IPv6 cuenta su /64, como el canje del código (RV-14)', async () => {
    const { espia, llamadas } = fingirRed();
    await onRequestPost({ request: peticion(bueno, '2001:db8:1:2:aaaa::1'), env: ENV });
    await onRequestPost({ request: peticion(bueno, '2001:db8:1:2:bbbb::9'), env: ENV });
    const esperado = await sha256Hex('sal-larga-de-pruebas' + normalizarIp('2001:db8:1:2::'));
    expect(llamadas.map((l) => l.cuerpo.ip_hash)).toEqual([esperado, esperado]);
    espia.mockRestore();
  });

  it('sin CF-Connecting-IP no inventa una: ip_hash nulo (cupo propio de lo que llega sin IP)', async () => {
    const { espia, llamadas } = fingirRed();
    const r = await onRequestPost({ request: peticion(bueno, null), env: ENV });
    expect(r.status).toBe(204);
    expect(llamadas[0]!.cuerpo.ip_hash).toBeNull();
    espia.mockRestore();
  });

  it('lo opcional puede faltar, y lo largo se recorta antes de mandarlo', async () => {
    const { espia, llamadas } = fingirRed();
    await onRequestPost({ request: peticion({ mensaje: 'm'.repeat(5000), pila: 'p'.repeat(9000) }), env: ENV });
    expect(llamadas[0]!.cuerpo).toEqual(expect.objectContaining({ dispositivo_id: null, ruta: null, agente: null }));
    expect(String(llamadas[0]!.cuerpo.mensaje)).toHaveLength(1000);
    expect(String(llamadas[0]!.cuerpo.pila)).toHaveLength(4096);
    espia.mockRestore();
  });

  it('lo que no tiene la forma esperada es 400 y no llega a la base de datos', async () => {
    const { espia, llamadas } = fingirRed();
    for (const cuerpo of [
      'no es json',
      [],
      {},
      { mensaje: '' },
      { mensaje: 42 },
      { ...bueno, dispositivo_id: 'no-es-uuid' },
      { ...bueno, pila: 7 },
      { ...bueno, ruta: {} },
      { ...bueno, agente: ['x'] },
    ]) {
      const r = await onRequestPost({ request: peticion(cuerpo), env: ENV });
      expect(r.status, JSON.stringify(cuerpo)).toBe(400);
      expect(await r.json()).toEqual({ error: 'PAYLOAD_INVALIDO' });
    }
    expect(llamadas).toHaveLength(0);
    espia.mockRestore();
  });

  it('si la base de datos no contesta, 503: el móvil lo deja en su cola y lo reintenta', async () => {
    const { espia } = fingirRed(new TypeError('fetch failed'));
    const r = await onRequestPost({ request: peticion(bueno), env: ENV });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'SERVIDOR_NO_DISPONIBLE' });
    espia.mockRestore();
  });
});
