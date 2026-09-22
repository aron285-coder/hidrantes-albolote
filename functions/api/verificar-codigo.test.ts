// La Function del canje del código (TR-41, TR-42, 11 §3). Es la única puerta abierta al exterior sin
// credencial previa: aquí se comprueba que la IP que cuenta para el límite es la real de Cloudflare y
// que nunca se guarda en claro, y que acertar o fallar el código tarda lo mismo.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Env } from '../_lib/comun.ts';
import { DURACION_MINIMA_MS, onRequestPost } from './verificar-codigo.ts';

const ENV = {
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-de-servicio', // detectar-secretos:permitir (valor de prueba)
  SAL_IP: 'sal-larga-de-pruebas', // detectar-secretos:permitir (valor de prueba)
} as Env;

const DISPOSITIVO = '0f1e2d3c-4b5a-4968-8776-6a5b4c3d2e1f';

const peticion = (cuerpo: unknown, cabeceras: Record<string, string> = { 'CF-Connecting-IP': '203.0.113.7' }) =>
  new Request('https://hidrantes-albolote-staging.pages.dev/api/verificar-codigo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabeceras },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  });

/** Lo que responde fn_verificar_codigo: una fila con token, o con error. */
const canje = (fila: Record<string, unknown>) => new Response(JSON.stringify([fila]));
const fingir = (r: Response | Error) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => (r instanceof Error ? Promise.reject(r) : Promise.resolve(r)));

describe('POST /api/verificar-codigo', () => {
  // Toda respuesta espera a completar DURACION_MINIMA_MS (TR-42). En las pruebas ese reloj se
  // adelanta a mano: lo que se comprueba aquí es la respuesta, no la paciencia.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Espera a que el manejador programe su espera, y solo entonces adelanta el reloj. */
  const alEsperar = async () => {
    for (let i = 0; i < 50 && vi.getTimerCount() === 0; i++) await vi.advanceTimersByTimeAsync(0);
  };

  const responder = async (request: Request) => {
    const respuesta = onRequestPost({ request, env: ENV });
    await alEsperar();
    await vi.advanceTimersByTimeAsync(DURACION_MINIMA_MS);
    return respuesta;
  };

  it('canjea el código por un token de dispositivo', async () => {
    const espia = fingir(canje({ token: 'tok_' + 'a'.repeat(30), caduca_en: '2027-09-22T00:00:00Z', error: null }));
    const r = await responder(peticion({ codigo: '123456', dispositivo_id: DISPOSITIVO }));

    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ token: 'tok_' + 'a'.repeat(30), caduca_en: '2027-09-22T00:00:00Z' });
    espia.mockRestore();
  });

  it('el límite se cuenta sobre la IP real de Cloudflare, y va cifrada (TR-41, 11 §3)', async () => {
    const espia = fingir(canje({ token: 't'.repeat(32), caduca_en: null, error: null }));
    await responder(
      peticion(
        { codigo: '123456', dispositivo_id: DISPOSITIVO },
        { 'CF-Connecting-IP': '203.0.113.7', 'X-Forwarded-For': '10.0.0.1' },
      ),
    );

    const cuerpo = JSON.parse((espia.mock.calls[0][1] as RequestInit).body as string) as Record<string, string>;
    expect(cuerpo.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(cuerpo)).not.toContain('203.0.113.7');
    expect(JSON.stringify(cuerpo)).not.toContain('10.0.0.1'); // la cabecera que el cliente sí puede inventarse
    espia.mockRestore();
  });

  it('sin la cabecera de Cloudflare no se cae: cuenta como una IP más', async () => {
    const espia = fingir(canje({ token: 't'.repeat(32), caduca_en: null, error: null }));
    const r = await responder(peticion({ codigo: '123456', dispositivo_id: DISPOSITIVO }, {}));
    expect(r.status).toBe(200);
    espia.mockRestore();
  });

  it('un código que no vale es 401 y no dice nada más (FR-33)', async () => {
    const espia = fingir(canje({ token: null, caduca_en: null, error: null }));
    const r = await responder(peticion({ codigo: '000001', dispositivo_id: DISPOSITIVO }));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: 'CODIGO_INCORRECTO' });
    espia.mockRestore();
  });

  it('pasado el límite, 429 con cuánto hay que esperar (TR-41)', async () => {
    const espia = fingir(canje({ token: null, caduca_en: null, error: 'DEMASIADOS_INTENTOS' }));
    const r = await responder(peticion({ codigo: '000001', dispositivo_id: DISPOSITIVO }));
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: 'DEMASIADOS_INTENTOS', reintentar_en_s: 3600 });
    espia.mockRestore();
  });

  it('rechaza lo que no tiene la forma esperada, sin preguntar a la base de datos', async () => {
    const espia = fingir(canje({ token: null, caduca_en: null, error: null }));
    for (const cuerpo of [
      {},
      { codigo: '123456' },
      { codigo: 123456, dispositivo_id: DISPOSITIVO },
      { codigo: '123456', dispositivo_id: 'no-es-uuid' },
      'esto no es json',
    ]) {
      const r = await responder(peticion(cuerpo));
      expect(r.status, JSON.stringify(cuerpo)).toBe(400);
      expect(await r.json()).toEqual({ error: 'PAYLOAD_INVALIDO' });
    }
    expect(espia).not.toHaveBeenCalled();
    espia.mockRestore();
  });

  it('si la base de datos no responde, 503 y la app lo trata como falta de servidor', async () => {
    const espia = fingir(new Error('ECONNREFUSED'));
    const r = await responder(peticion({ codigo: '123456', dispositivo_id: DISPOSITIVO }));
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'SERVIDOR_NO_DISPONIBLE' });
    espia.mockRestore();
  });

  // TR-42: si acertar tardara menos que fallar, se podría adivinar el código a base de cronómetro.
  // Se comprueba que ninguna de las dos respuestas sale antes de tiempo, no cuánto tarda el reloj.
  it('ni acertar ni fallar responden antes de la duración mínima', async () => {
    const saleAntesDeTiempo = async (fila: Record<string, unknown>) => {
      const espia = fingir(canje(fila));
      let lista = false;
      const respuesta = onRequestPost({
        request: peticion({ codigo: '123456', dispositivo_id: DISPOSITIVO }),
        env: ENV,
      }).then((r) => {
        lista = true;
        return r;
      });
      await alEsperar();
      await vi.advanceTimersByTimeAsync(DURACION_MINIMA_MS - 1);
      const pronto = lista;
      await vi.advanceTimersByTimeAsync(1);
      await respuesta;
      espia.mockRestore();
      return { pronto, despues: lista };
    };

    expect(await saleAntesDeTiempo({ token: 't'.repeat(32), caduca_en: null, error: null })).toEqual({
      pronto: false,
      despues: true,
    });
    expect(await saleAntesDeTiempo({ token: null, caduca_en: null, error: null })).toEqual({
      pronto: false,
      despues: true,
    });
  });
});
