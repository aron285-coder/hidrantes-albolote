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

  // docs/32 RV-220 (0041): los topes nuevos de fotos llegan con su código y, si la base de datos los da,
  // con maximo y reintentar_en_s, para que la cola espere hasta esa hora (RV-232). Nunca el texto.
  it.each([
    ['SIN_ESPACIO_FOTOS', 'SIN_ESPACIO_FOTOS: reintentar_en_s=3600', { reintentar_en_s: 3600 }],
    ['RESERVAS_ABIERTAS', 'RESERVAS_ABIERTAS: maximo=6 reintentar_en_s=900', { maximo: 6, reintentar_en_s: 900 }],
    [
      'CUOTA_SUBIDAS_AGOTADA',
      'CUOTA_SUBIDAS_AGOTADA: maximo=150 reintentar_en_s=40000',
      { maximo: 150, reintentar_en_s: 40000 },
    ],
    ['SIN_ESPACIO_FOTOS', 'SIN_ESPACIO_FOTOS: Se ha llenado el espacio de fotos', {}],
    // docs/33 RV-303: el ámbito del tope (0042), para que el móvil diga si es suyo o del grupo.
    [
      'CUOTA_SUBIDAS_AGOTADA',
      'CUOTA_SUBIDAS_AGOTADA: maximo=80 reintentar_en_s=600 ambito=dispositivo',
      { maximo: 80, reintentar_en_s: 600, ambito: 'dispositivo' },
    ],
    [
      'CUOTA_SUBIDAS_AGOTADA',
      'CUOTA_SUBIDAS_AGOTADA: maximo=150 reintentar_en_s=40000 ambito=grupo',
      { maximo: 150, reintentar_en_s: 40000, ambito: 'grupo' },
    ],
    // Un valor fuera de la lista blanca no llega al cliente.
    [
      'CUOTA_SUBIDAS_AGOTADA',
      'CUOTA_SUBIDAS_AGOTADA: maximo=150 reintentar_en_s=40000 ambito=otro',
      { maximo: 150, reintentar_en_s: 40000 },
    ],
  ])('%s llega como 429 con su espera (%s)', async (codigo, mensaje, detalle) => {
    const espia = fingirRed({
      reserva: new Response(JSON.stringify({ code: 'P0001', message: mensaje }), { status: 400 }),
    });
    const r = await onRequestPost({ request: peticion({ token: TOKEN }), env: ENV });
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: codigo, ...detalle });
    // Con un tope no se pide firma a Storage.
    expect(espia.mock.calls.some((c) => String(c[0]).includes('/storage/'))).toBe(false);
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
