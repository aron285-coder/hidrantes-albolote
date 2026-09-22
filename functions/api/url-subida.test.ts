// La reserva de foto (TR-40, TR-45, 04 §7). Nadie escribe en Storage sin pasar por aquí: el bucket
// no tiene políticas de escritura para nadie, así que esta Function es la única forma de subir. Lo
// que se comprueba es quién puede pedirla, en qué bucket cae y qué pasa cuando la cuota se agota.

import { describe, expect, it, vi } from 'vitest';
import { type Env } from '../_lib/comun.ts';
import { CADUCIDAD_S, onRequestPost } from './url-subida.ts';

const ENV = {
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-de-servicio', // detectar-secretos:permitir (valor de prueba)
  SAL_IP: 'sal',
} as Env;

const TOKEN = 'tok_' + 'a'.repeat(30);
const RUTA = '2026/09/0f1e2d3c4b5a.jpg';

const peticion = (
  cuerpo: unknown,
  cabeceras: Record<string, string> = {},
  url = 'https://x.pages.dev/api/url-subida',
) =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabeceras },
    body: JSON.stringify(cuerpo),
  });

/** Encamina cada llamada según a dónde va: RPC de reserva o firma de Storage. */
function fingirRed(opciones: { reserva?: Response | Error; firma?: Response | Error } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((entrada) => {
    const url = String(entrada);
    const elegida = url.includes('/storage/') ? opciones.firma : opciones.reserva;
    const r = elegida ?? new Response('null');
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  });
}

const reservaOk = () => new Response(JSON.stringify(RUTA));
const firmaOk = () =>
  new Response(JSON.stringify({ url: `/object/upload/sign/hidrantes-fotos-dev/${RUTA}?token=xyz` }));

describe('POST /api/url-subida', () => {
  it('el voluntario reserva con su token y recibe la URL firmada', async () => {
    const espia = fingirRed({ reserva: reservaOk(), firma: firmaOk() });
    const r = await onRequestPost({ request: peticion({ token: TOKEN }), env: ENV });

    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      foto_path: RUTA,
      url: `https://proyecto.supabase.co/storage/v1/object/upload/sign/hidrantes-fotos-dev/${RUTA}?token=xyz`,
      caduca_en_s: CADUCIDAD_S,
    });
    expect(String(espia.mock.calls[0][0])).toContain('/rpc/fn_reservar_subida');
    espia.mockRestore();
  });

  it('jefatura desde el móvil reserva con su sesión de Google (DEC-059)', async () => {
    const espia = fingirRed({ reserva: reservaOk(), firma: firmaOk() });
    const r = await onRequestPost({ request: peticion({}, { Authorization: 'Bearer aaa.bbb.ccc' }), env: ENV });

    expect(r.status).toBe(200);
    expect(String(espia.mock.calls[0][0])).toContain('/rpc/fn_reservar_subida_admin');
    expect((espia.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer aaa.bbb.ccc' });
    espia.mockRestore();
  });

  it('sin token ni sesión, 401 y no se toca Storage (TR-40)', async () => {
    const espia = fingirRed({ reserva: reservaOk(), firma: firmaOk() });
    for (const cuerpo of [{}, { token: 'corto' }, { token: 12345 }]) {
      const r = await onRequestPost({ request: peticion(cuerpo), env: ENV });
      expect(r.status, JSON.stringify(cuerpo)).toBe(401);
      expect(await r.json()).toEqual({ error: 'TOKEN_INVALIDO' });
    }
    expect(espia).not.toHaveBeenCalled();
    espia.mockRestore();
  });

  it('la cuota diaria llega al cliente como 429, no como error genérico (TR-45)', async () => {
    const espia = fingirRed({
      reserva: new Response(
        JSON.stringify({ code: 'P0001', message: 'CUOTA_SUBIDAS_AGOTADA: Has llegado al máximo de fotos de hoy' }),
        { status: 400 },
      ),
    });
    const r = await onRequestPost({ request: peticion({ token: TOKEN }), env: ENV });
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: 'CUOTA_SUBIDAS_AGOTADA' });
    espia.mockRestore();
  });

  it('un token caducado es 401 y la app vuelve a pedir el código', async () => {
    const espia = fingirRed({
      reserva: new Response(JSON.stringify({ code: 'P0001', message: 'TOKEN_CADUCADO: vuelve a entrar' }), {
        status: 400,
      }),
    });
    const r = await onRequestPost({ request: peticion({ token: TOKEN }), env: ENV });
    expect(r.status).toBe(401);
    espia.mockRestore();
  });

  // 04 §4: solo el dominio de producción escribe en el bucket de producción.
  it('el bucket sale del dominio desde el que se pide', async () => {
    for (const [url, bucket] of [
      ['https://hidrantes-albolote.pages.dev/api/url-subida', 'hidrantes-fotos'],
      ['https://hidrantes-albolote-staging.pages.dev/api/url-subida', 'hidrantes-fotos-dev'],
    ] as const) {
      const espia = fingirRed({ reserva: reservaOk(), firma: firmaOk() });
      await onRequestPost({ request: peticion({ token: TOKEN }, {}, url), env: ENV });
      const firmada = espia.mock.calls.map((c) => String(c[0])).find((u) => u.includes('/storage/'));
      expect(firmada, url).toBe(`https://proyecto.supabase.co/storage/v1/object/upload/sign/${bucket}/${RUTA}`);
      espia.mockRestore();
    }
  });

  it('si Storage no firma, 503: la foto se queda en la cola del móvil', async () => {
    for (const firma of [new Response('no', { status: 500 }), new Error('caído')]) {
      const espia = fingirRed({ reserva: reservaOk(), firma });
      const r = await onRequestPost({ request: peticion({ token: TOKEN }), env: ENV });
      expect(r.status).toBe(503);
      expect(await r.json()).toEqual({ error: 'SERVIDOR_NO_DISPONIBLE' });
      espia.mockRestore();
    }
  });
});
