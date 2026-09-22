// El envío de avisos (FR-163, FR-164, TR-104). Quién puede dispararlo, qué pasa si no hay claves
// VAPID configuradas y, sobre todo, que cada aviso reclamado se dé por resuelto pase lo que pase:
// si un envío fallido no se anotara, el aviso se reintentaría para siempre.

import { describe, expect, it, vi } from 'vitest';
import { type Env } from '../_lib/comun.ts';
import { onRequestPost } from './push.ts';

/** Claves del ejemplo de la RFC 8291: sirven para cifrar de verdad en la prueba. */
const SUSCRIPCION = {
  endpoint: 'https://push.example.net/push/JzLQ3raZJfFBR0aqvOMsLrt54w4rJUsV',
  keys: {
    p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  },
};

const ENV = {
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-de-servicio', // detectar-secretos:permitir (valor de prueba)
  SAL_IP: 'sal',
  VAPID_PUBLIC_KEY: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  VAPID_PRIVATE_KEY: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', // detectar-secretos:permitir (RFC 8291 §5)
  VAPID_SUBJECT: 'mailto:hidrantes@albolote-pc.es',
  VIGILANCIA_SECRETO: 'secreto-de-vigilancia',
} as Env;

const pendiente = (id: number) => ({
  id,
  titulo: `Aprobada HID-014${id}`,
  cuerpo: 'Tu alta se aprobó',
  url: '/mis-propuestas',
  suscripcion_id: '0f1e2d3c-4b5a-4968-8776-6a5b4c3d2e1f',
  suscripcion: SUSCRIPCION,
});

const peticion = (cuerpo: unknown = {}, cabeceras: Record<string, string> = {}) =>
  new Request('https://hidrantes-albolote-staging.pages.dev/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabeceras },
    body: JSON.stringify(cuerpo),
  });

interface Red {
  admin?: boolean;
  token?: boolean;
  pendientes?: ReturnType<typeof pendiente>[];
  servicioPush?: Response;
}

function fingirRed(red: Red = {}) {
  const llamadas: { url: string; cuerpo: unknown }[] = [];
  const espia = vi.spyOn(globalThis, 'fetch').mockImplementation((entrada, opciones) => {
    const url = String(entrada);
    const texto = (opciones as RequestInit | undefined)?.body;
    llamadas.push({ url, cuerpo: typeof texto === 'string' ? JSON.parse(texto) : texto });
    if (url.includes('fn_es_admin')) return Promise.resolve(new Response(String(red.admin ?? false)));
    if (url.includes('fn_listar_puntos')) {
      return Promise.resolve(
        red.token ? new Response('{"puntos":[],"bajas":[]}') : new Response('{}', { status: 401 }),
      );
    }
    if (url.includes('fn_reclamar_notificaciones')) {
      return Promise.resolve(new Response(JSON.stringify(red.pendientes ?? [])));
    }
    if (url.includes('fn_resultado_notificacion')) return Promise.resolve(new Response('null'));
    return Promise.resolve(red.servicioPush ?? new Response(null, { status: 201 }));
  });
  return { espia, llamadas };
}

describe('POST /api/push', () => {
  it('sin credencial ninguna, 401', async () => {
    const { espia } = fingirRed();
    const r = await onRequestPost({ request: peticion(), env: ENV });
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: 'NO_AUTORIZADO' });
    espia.mockRestore();
  });

  it('un token de dispositivo que ya no vale tampoco abre la puerta', async () => {
    const { espia } = fingirRed({ token: false });
    const r = await onRequestPost({ request: peticion({ token: 'tok_inventado' }), env: ENV });
    expect(r.status).toBe(401);
    espia.mockRestore();
  });

  it('el secreto de la vigilancia tiene que coincidir entero', async () => {
    const { espia } = fingirRed();
    const r = await onRequestPost({ request: peticion({}, { 'X-Vigilancia': 'secreto-de-vigilanci' }), env: ENV });
    expect(r.status).toBe(401);
    espia.mockRestore();
  });

  it('sin claves VAPID configuradas lo dice, en vez de fallar por dentro', async () => {
    const { espia } = fingirRed({ admin: true });
    const sinClaves = { ...ENV, VAPID_PRIVATE_KEY: undefined } as Env;
    const r = await onRequestPost({ request: peticion({}, { Authorization: 'Bearer a.b.c' }), env: sinClaves });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'NO_CONFIGURADO' });
    espia.mockRestore();
  });

  it('sin nada pendiente no envía nada y responde en cero', async () => {
    const { espia, llamadas } = fingirRed({ admin: true, pendientes: [] });
    const r = await onRequestPost({ request: peticion({}, { Authorization: 'Bearer a.b.c' }), env: ENV });
    expect(await r.json()).toEqual({ enviadas: 0, fallidas: 0 });
    expect(llamadas.some((l) => l.url.includes('push.example.net'))).toBe(false);
    espia.mockRestore();
  });

  it('envía lo reclamado y anota el resultado de cada aviso', async () => {
    const { espia, llamadas } = fingirRed({
      admin: true,
      pendientes: [pendiente(1), pendiente(2)],
    });
    const r = await onRequestPost({ request: peticion({}, { Authorization: 'Bearer a.b.c' }), env: ENV });

    expect(await r.json()).toEqual({ enviadas: 2, fallidas: 0 });
    const alServicio = llamadas.filter((l) => l.url === SUSCRIPCION.endpoint);
    expect(alServicio).toHaveLength(2);
    const resultados = llamadas.filter((l) => l.url.includes('fn_resultado_notificacion'));
    expect(resultados.map((l) => l.cuerpo)).toEqual([
      { notificacion_id: 1, ok: true, error: null, suscripcion_caducada: false },
      { notificacion_id: 2, ok: true, error: null, suscripcion_caducada: false },
    ]);
    espia.mockRestore();
  });

  it('una suscripción que el servicio ya no conoce se marca caducada para borrarla', async () => {
    const { espia, llamadas } = fingirRed({
      admin: true,
      pendientes: [pendiente(7)],
      servicioPush: new Response(null, { status: 410 }),
    });
    const r = await onRequestPost({ request: peticion({}, { Authorization: 'Bearer a.b.c' }), env: ENV });

    expect(await r.json()).toEqual({ enviadas: 0, fallidas: 1 });
    expect(llamadas.find((l) => l.url.includes('fn_resultado_notificacion'))?.cuerpo).toEqual({
      notificacion_id: 7,
      ok: false,
      error: 'HTTP 410',
      suscripcion_caducada: true,
    });
    espia.mockRestore();
  });

  // FR-27: un aviso nunca lleva el nombre de otro voluntario, y además viaja cifrado.
  it('el cuerpo que sale hacia el servicio de push no lleva el texto en claro', async () => {
    const { espia, llamadas } = fingirRed({ admin: true, pendientes: [pendiente(3)] });
    await onRequestPost({ request: peticion({}, { Authorization: 'Bearer a.b.c' }), env: ENV });

    const enviado = llamadas.find((l) => l.url === SUSCRIPCION.endpoint)!.cuerpo as Uint8Array;
    expect(new TextDecoder().decode(enviado)).not.toContain('HID-0143');
    espia.mockRestore();
  });
});
