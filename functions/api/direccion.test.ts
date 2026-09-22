// La deducción de dirección (FR-15, FR-105, TR-40, TR-72). Es la única Function que llama a un
// tercero, así que aquí se comprueba lo que importa: que solo jefatura puede pedirla, que no se
// vuelve a preguntar lo ya preguntado, y que si Nominatim calla, la revisión sigue.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Env } from '../_lib/comun.ts';
import { onRequestGet } from './direccion.ts';

const ENV = {
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-de-servicio', // detectar-secretos:permitir (valor de prueba)
  SAL_IP: 'sal',
  NOMINATIM_USER_AGENT: 'hidrantes-albolote/1.0 (pruebas)',
} as Env;

const PROPUESTA = '0f1e2d3c-4b5a-4968-8776-6a5b4c3d2e1f';
const ALBOLOTE = { lat: '37.2309', lng: '-3.6558' };

const peticion = (parametros: Record<string, string>, conSesion = true) =>
  new Request(`https://hidrantes-albolote-staging.pages.dev/api/direccion?${new URLSearchParams(parametros)}`, {
    headers: conSesion ? { Authorization: 'Bearer aaa.bbb.ccc' } : {},
  });

interface Red {
  admin?: boolean;
  cola?: Response;
  nominatim?: Response | Error;
}

/** Encamina por destino: fn_es_admin, la vista de la cola, Nominatim o la RPC de guardado. */
function fingirRed(red: Red) {
  const llamadas: string[] = [];
  const espia = vi.spyOn(globalThis, 'fetch').mockImplementation((entrada) => {
    const url = String(entrada instanceof URL ? entrada.href : entrada);
    llamadas.push(url);
    if (url.includes('fn_es_admin')) return Promise.resolve(new Response(String(red.admin ?? true)));
    if (url.includes('v_cola_revision')) return Promise.resolve(red.cola ?? new Response('[]'));
    if (url.includes('nominatim')) {
      const r = red.nominatim ?? new Response(JSON.stringify({ address: { road: 'Calle Real', town: 'Albolote' } }));
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
    }
    return Promise.resolve(new Response('null'));
  });
  return { espia, llamadas };
}

describe('GET /api/direccion', () => {
  // Nominatim solo admite una petición por segundo (TR-72) y el módulo las espacia de verdad: con el
  // reloj fingido, esa espera se adelanta en vez de sufrirla.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const responder = async (request: Request) => {
    const respuesta = onRequestGet({ request, env: ENV });
    let lista = false;
    void respuesta.then(() => (lista = true));
    for (let i = 0; i < 50 && !lista; i++) await vi.advanceTimersByTimeAsync(1000);
    return respuesta;
  };

  it('sin sesión de administrador, 403 y no se pregunta a nadie (TR-40)', async () => {
    const { espia, llamadas } = fingirRed({ admin: false });
    const r = await responder(peticion(ALBOLOTE));
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'NO_AUTORIZADO' });
    expect(llamadas.some((u) => u.includes('nominatim'))).toBe(false);
    espia.mockRestore();
  });

  it('sin siquiera cabecera Authorization, 403', async () => {
    const { espia } = fingirRed({});
    const r = await responder(peticion(ALBOLOTE, false));
    expect(r.status).toBe(403);
    espia.mockRestore();
  });

  it('devuelve la dirección deducida de las coordenadas', async () => {
    const { espia, llamadas } = fingirRed({});
    const r = await responder(peticion(ALBOLOTE));
    expect(await r.json()).toEqual({ direccion: 'Calle Real, Albolote', fuente: 'nominatim', cacheada: false });
    expect(llamadas.find((u) => u.includes('nominatim'))).toContain('lat=37.2309');
    espia.mockRestore();
  });

  it('coordenadas fuera de la provincia o mal escritas: 400, sin gastar una petición a Nominatim', async () => {
    const { espia, llamadas } = fingirRed({});
    for (const p of [
      { lat: 'hola', lng: '-3.65' },
      { lat: '40.4', lng: '-3.7' }, // Madrid
      { lat: '37.23', lng: '2.5' },
      {},
    ]) {
      const r = await responder(peticion(p as Record<string, string>));
      expect(r.status, JSON.stringify(p)).toBe(400);
    }
    expect(llamadas.some((u) => u.includes('nominatim'))).toBe(false);
    espia.mockRestore();
  });

  it('un identificador de propuesta que no es un uuid es 400', async () => {
    const { espia } = fingirRed({});
    const r = await responder(peticion({ ...ALBOLOTE, propuesta_id: 'no-uuid' }));
    expect(r.status).toBe(400);
    espia.mockRestore();
  });

  it('si la propuesta ya tenía dirección, no se vuelve a preguntar (TR-72)', async () => {
    const { espia, llamadas } = fingirRed({
      cola: new Response(JSON.stringify([{ direccion_sugerida: 'Calle Real 14, Albolote' }])),
    });
    const r = await responder(peticion({ ...ALBOLOTE, propuesta_id: PROPUESTA }));

    expect(await r.json()).toEqual({ direccion: 'Calle Real 14, Albolote', fuente: 'nominatim', cacheada: true });
    expect(llamadas.some((u) => u.includes('nominatim'))).toBe(false);
    espia.mockRestore();
  });

  it('lo deducido se guarda en la propuesta para el resto de la revisión', async () => {
    const { espia, llamadas } = fingirRed({});
    await responder(peticion({ ...ALBOLOTE, propuesta_id: PROPUESTA }));
    expect(llamadas.some((u) => u.includes('fn_guardar_direccion_sugerida'))).toBe(true);
    espia.mockRestore();
  });

  // FR-15: sin dirección se aprueba igual. Lo que no puede pasar es que la pantalla se quede colgada.
  it('si Nominatim no responde, se contesta que no hay dirección, no un error', async () => {
    for (const fallo of [new Error('timeout'), new Response('', { status: 503 })]) {
      const { espia, llamadas } = fingirRed({ nominatim: fallo });
      const r = await responder(peticion({ ...ALBOLOTE, propuesta_id: PROPUESTA }));
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ direccion: null, fuente: 'nominatim', motivo: 'sin_respuesta' });
      expect(llamadas.some((u) => u.includes('fn_guardar_direccion_sugerida'))).toBe(false);
      espia.mockRestore();
    }
  });
});
