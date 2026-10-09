// El envío de avisos (FR-163, FR-164, TR-104). Quién puede dispararlo, qué pasa si no hay claves
// VAPID configuradas y, sobre todo, que cada aviso reclamado se dé por resuelto pase lo que pase:
// si un envío fallido no se anotara, el aviso se reintentaría para siempre.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Env } from '../_lib/comun.ts';
import { _reiniciarLimites } from '../_lib/limite.ts';
import { LIMITE_PUSH_POR_HORA, onRequestPost } from './push.ts';

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
  /** fn_validar_token: vale, lo rechaza (TOKEN_INVALIDO) o falla por dentro (permiso denegado). */
  token?: boolean | 'sin_permiso';
  /** fn_registrar_error tampoco contesta bien. */
  registroCae?: boolean;
  pendientes?: ReturnType<typeof pendiente>[];
  servicioPush?: Response;
  /** Respuesta del servicio de push según el endpoint; manda sobre `servicioPush`. */
  servicioPushPor?: (url: string) => Response;
  /** fn_resultado_notificacion no contesta (p. ej. se acabaron las peticiones de la invocación). */
  resultadoCae?: boolean;
  /** fn_aplazar_notificaciones no contesta. */
  aplazarCae?: boolean;
  /** Servicios de push (origen) que no contestan: corte de red, DNS o tiempo agotado. */
  serviciosCaidos?: string[];
}

/** Lo que contesta PostgREST cuando el rol no tiene execute sobre la función. */
const PERMISO_DENEGADO = () =>
  new Response(JSON.stringify({ code: '42501', message: 'permission denied for function' }), { status: 401 });

function fingirRed(red: Red = {}) {
  const llamadas: { url: string; cuerpo: unknown }[] = [];
  const espia = vi.spyOn(globalThis, 'fetch').mockImplementation((entrada, opciones) => {
    const url = String(entrada);
    const texto = (opciones as RequestInit | undefined)?.body;
    llamadas.push({ url, cuerpo: typeof texto === 'string' ? JSON.parse(texto) : texto });
    if (url.includes('fn_es_admin')) return Promise.resolve(new Response(String(red.admin ?? false)));
    // Como en Supabase: service_role no ejecuta fn_listar_puntos (#561); fn_validar_token sí (0043).
    if (url.includes('fn_listar_puntos')) return Promise.resolve(PERMISO_DENEGADO());
    if (url.includes('fn_validar_token')) {
      if (red.token === 'sin_permiso') return Promise.resolve(PERMISO_DENEGADO());
      return Promise.resolve(
        red.token
          ? new Response('"a5610000-0000-4000-8000-000000000561"')
          : new Response(JSON.stringify({ code: 'P0001', message: 'TOKEN_INVALIDO: Acceso no válido' }), {
              status: 400,
            }),
      );
    }
    if (url.includes('fn_registrar_error')) {
      return Promise.resolve(
        red.registroCae ? new Response('{}', { status: 500 }) : new Response(null, { status: 204 }),
      );
    }
    if (url.includes('fn_reclamar_notificaciones')) {
      return Promise.resolve(new Response(JSON.stringify(red.pendientes ?? [])));
    }
    if (url.includes('fn_aplazar_notificaciones')) {
      return red.aplazarCae
        ? Promise.reject(new TypeError('Too many subrequests'))
        : Promise.resolve(new Response('1'));
    }
    if (url.includes('fn_resultado_notificacion')) {
      return red.resultadoCae
        ? Promise.reject(new TypeError('Too many subrequests'))
        : Promise.resolve(new Response('null'));
    }
    if (red.serviciosCaidos?.some((o) => url.startsWith(o))) return Promise.reject(new TypeError('fetch failed'));
    if (red.servicioPushPor) return Promise.resolve(red.servicioPushPor(url));
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

  it('un token de voluntario válido pide el envío: se comprueba con fn_validar_token (#561)', async () => {
    const { espia, llamadas } = fingirRed({ token: true, pendientes: [] });
    const r = await onRequestPost({ request: peticion({ token: 'tok_valido_de_un_movil_0561' }), env: ENV });
    expect(r.status).toBe(200);
    const validacion = llamadas.find((l) => l.url.endsWith('/rest/v1/rpc/fn_validar_token'));
    expect(validacion?.cuerpo).toEqual({ token: 'tok_valido_de_un_movil_0561' });
    expect(llamadas.some((l) => l.url.includes('fn_listar_puntos'))).toBe(false);
    espia.mockRestore();
  });

  it('si el token no se puede comprobar, 503 y queda anotado, sin el token: no es culpa del voluntario', async () => {
    const { espia, llamadas } = fingirRed({ token: 'sin_permiso', pendientes: [] });
    const r = await onRequestPost({ request: peticion({ token: 'tok_valido_de_un_movil_0561' }), env: ENV });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'SERVIDOR_NO_DISPONIBLE' });
    const anotado = llamadas.find((l) => l.url.endsWith('/rest/v1/rpc/fn_registrar_error'));
    expect(anotado?.cuerpo).toMatchObject({
      mensaje: 'validar_token_fallo: NO_AUTORIZADO',
      ruta: '/api/push',
      ip_hash: 'funcion:validar_token',
    });
    expect(JSON.stringify(anotado?.cuerpo)).not.toContain('tok_valido_de_un_movil_0561');
    expect(llamadas.some((l) => l.url.includes('fn_reclamar_notificaciones'))).toBe(false);
    espia.mockRestore();
  });

  it('si tampoco se puede anotar, sigue siendo 503 y queda en el registro del Worker, sin el token', async () => {
    const { espia } = fingirRed({ token: 'sin_permiso', registroCae: true });
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await onRequestPost({ request: peticion({ token: 'tok_valido_de_un_movil_0561' }), env: ENV });
    expect(r.status).toBe(503);
    expect(consola).toHaveBeenCalledWith('validar_token_fallo sin anotar: NO_AUTORIZADO / ERROR_INTERNO en /api/push');
    expect(JSON.stringify(consola.mock.calls)).not.toContain('tok_valido_de_un_movil_0561');
    consola.mockRestore();
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
    expect(await r.json()).toEqual({ enviadas: 0, fallidas: 0, sin_anotar: 0, aplazadas: 0, quedan: false });
    expect(llamadas.some((l) => l.url.includes('push.example.net'))).toBe(false);
    espia.mockRestore();
  });

  it('envía lo reclamado y anota el resultado de cada aviso', async () => {
    const { espia, llamadas } = fingirRed({
      admin: true,
      pendientes: [pendiente(1), pendiente(2)],
    });
    const r = await onRequestPost({ request: peticion({}, { Authorization: 'Bearer a.b.c' }), env: ENV });

    expect(await r.json()).toEqual({ enviadas: 2, fallidas: 0, sin_anotar: 0, aplazadas: 0, quedan: false });
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

    expect(await r.json()).toEqual({ enviadas: 0, fallidas: 1, sin_anotar: 0, aplazadas: 0, quedan: false });
    expect(llamadas.find((l) => l.url.includes('fn_resultado_notificacion'))?.cuerpo).toEqual({
      notificacion_id: 7,
      ok: false,
      error: 'HTTP 410',
      suscripcion_caducada: true,
    });
    espia.mockRestore();
  });

  // RV-84: un error pasajero del servicio se anota como fallo, pero nunca como caducidad.
  it('un 500 del servicio se anota como fallo sin caducar la suscripción', async () => {
    const { espia, llamadas } = fingirRed({
      admin: true,
      pendientes: [pendiente(8)],
      servicioPush: new Response(null, { status: 500 }),
    });
    const r = await onRequestPost({ request: peticion({}, { Authorization: 'Bearer a.b.c' }), env: ENV });

    expect(await r.json()).toEqual({ enviadas: 0, fallidas: 1, sin_anotar: 0, aplazadas: 0, quedan: false });
    expect(llamadas.find((l) => l.url.includes('fn_resultado_notificacion'))?.cuerpo).toEqual({
      notificacion_id: 8,
      ok: false,
      error: 'HTTP 500',
      suscripcion_caducada: false,
    });
    espia.mockRestore();
  });

  // RV-144: un corte de red no es un fallo del aviso. No se anota (un error lo dejaría fuera de
  // fn_reclamar_notificaciones para siempre, y la suscripción sumaría un fallo): queda reclamado y
  // sale en la siguiente pasada, con el mismo tope de tres intentos. Un 500 sí se anota (arriba).
  it('un fallo de red no se anota: el aviso se reintenta y la suscripción no suma fallos', async () => {
    const otro = {
      ...pendiente(9),
      suscripcion: { ...SUSCRIPCION, endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/otro' },
    };
    const { espia, llamadas } = fingirRed({
      admin: true,
      pendientes: [pendiente(1), otro, pendiente(2)],
      serviciosCaidos: ['https://push.example.net/'],
    });
    const r = await onRequestPost({ request: peticion({}, { Authorization: 'Bearer a.b.c' }), env: ENV });

    expect(r.status).toBe(200);
    // Los dos de push.example.net se intentan (no hay 429 que frene ese servicio) y quedan sin
    // anotar; el del otro servicio sale y se anota.
    expect(await r.json()).toEqual({ enviadas: 1, fallidas: 0, sin_anotar: 2, aplazadas: 0, quedan: false });
    expect(llamadas.filter((l) => l.url === SUSCRIPCION.endpoint)).toHaveLength(2);
    const resultados = llamadas.filter((l) => l.url.includes('fn_resultado_notificacion'));
    expect(resultados.map((l) => l.cuerpo)).toEqual([
      { notificacion_id: 9, ok: true, error: null, suscripcion_caducada: false },
    ]);
    expect(llamadas.some((l) => l.url.includes('fn_aplazar_notificaciones'))).toBe(false);
    espia.mockRestore();
  });

  it('con claves VAPID que no sirven, NO_CONFIGURADO y no se anota nada contra las suscripciones', async () => {
    const { espia, llamadas } = fingirRed({ admin: true, pendientes: [pendiente(1), pendiente(2)] });
    const rotas = { ...ENV, VAPID_PRIVATE_KEY: 'no-es-una-clave' } as Env; // detectar-secretos:permitir (valor de prueba)
    const r = await onRequestPost({ request: peticion({}, { Authorization: 'Bearer a.b.c' }), env: rotas });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'NO_CONFIGURADO' });
    expect(llamadas.some((l) => l.url === SUSCRIPCION.endpoint)).toBe(false);
    expect(llamadas.some((l) => l.url.includes('fn_resultado_notificacion'))).toBe(false);
    espia.mockRestore();
  });

  // RV-84: con un 429 el servicio pide esperar. El aviso no se anota (ni fallo en la suscripción ni
  // error en el aviso): se aplaza lo que diga Retry-After, sin gastar intento. Lo que quede para ese
  // mismo servicio en esta invocación tampoco se manda; el de los otros servicios, sí.
  it('429 con Retry-After: sin fallo, el aviso sigue pendiente y no se insiste en ese servicio', async () => {
    const otro = {
      ...pendiente(9),
      suscripcion: { ...SUSCRIPCION, endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/otro' },
    };
    const veinte = [pendiente(1), pendiente(2), otro, ...Array.from({ length: 17 }, (_, i) => pendiente(i + 10))];
    const { espia, llamadas } = fingirRed({
      admin: true,
      pendientes: veinte,
      servicioPushPor: (url) =>
        url.startsWith('https://push.example.net/')
          ? new Response(null, { status: 429, headers: { 'Retry-After': '120' } })
          : new Response(null, { status: 201 }),
    });
    const r = await onRequestPost({ request: peticion({}, { Authorization: 'Bearer a.b.c' }), env: ENV });

    // 19 avisos a push.example.net: uno se intenta y recibe 429, los otros 18 ni se intentan.
    // El lote venía lleno y no todo se ha aplazado: el Worker puede pedir el siguiente.
    expect(await r.json()).toEqual({ enviadas: 1, fallidas: 0, sin_anotar: 0, aplazadas: 19, quedan: true });
    expect(llamadas.filter((l) => l.url === SUSCRIPCION.endpoint)).toHaveLength(1);
    const resultados = llamadas.filter((l) => l.url.includes('fn_resultado_notificacion'));
    expect(resultados.map((l) => (l.cuerpo as { notificacion_id: number }).notificacion_id)).toEqual([9]);
    const aplazar = llamadas.filter((l) => l.url.includes('fn_aplazar_notificaciones'));
    expect(aplazar.map((l) => l.cuerpo)).toEqual([
      { ids: [1, 2, ...Array.from({ length: 17 }, (_, i) => i + 10)], segundos: 120 },
    ]);
    expect(llamadas.length).toBeLessThanOrEqual(50);
    espia.mockRestore();
  });

  it('429 sin Retry-After: se aplaza 60 s; con todo el lote aplazado, el Worker no insiste', async () => {
    const veinte = Array.from({ length: 20 }, (_, i) => pendiente(i + 1));
    const { espia, llamadas } = fingirRed({
      admin: true,
      pendientes: veinte,
      servicioPush: new Response(null, { status: 429 }),
    });
    const r = await onRequestPost({ request: peticion({}, { Authorization: 'Bearer a.b.c' }), env: ENV });

    expect(await r.json()).toEqual({ enviadas: 0, fallidas: 0, sin_anotar: 0, aplazadas: 20, quedan: false });
    expect(llamadas.find((l) => l.url.includes('fn_aplazar_notificaciones'))?.cuerpo).toEqual({
      ids: veinte.map((p) => p.id),
      segundos: 60,
    });
    expect(llamadas.some((l) => l.url.includes('fn_resultado_notificacion'))).toBe(false);
    espia.mockRestore();
  });

  it('si no se puede aplazar, los avisos cuentan como sin anotar (salen a los 15 minutos)', async () => {
    const { espia } = fingirRed({
      admin: true,
      pendientes: [pendiente(1)],
      servicioPush: new Response(null, { status: 429, headers: { 'Retry-After': '30' } }),
      aplazarCae: true,
    });
    const r = await onRequestPost({ request: peticion({}, { Authorization: 'Bearer a.b.c' }), env: ENV });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ enviadas: 0, fallidas: 0, sin_anotar: 1, aplazadas: 1, quedan: false });
    espia.mockRestore();
  });

  it('un Retry-After enorme se queda en un día', async () => {
    const { espia, llamadas } = fingirRed({
      admin: true,
      pendientes: [pendiente(1)],
      servicioPush: new Response(null, { status: 429, headers: { 'Retry-After': '99999999999' } }),
    });
    await onRequestPost({ request: peticion({}, { Authorization: 'Bearer a.b.c' }), env: ENV });
    expect(llamadas.find((l) => l.url.includes('fn_aplazar_notificaciones'))?.cuerpo).toEqual({
      ids: [1],
      segundos: 86_400,
    });
    espia.mockRestore();
  });

  it('sin ningún 429 no se llama a fn_aplazar_notificaciones', async () => {
    const { espia, llamadas } = fingirRed({ admin: true, pendientes: [pendiente(1)] });
    await onRequestPost({ request: peticion({}, { Authorization: 'Bearer a.b.c' }), env: ENV });
    expect(llamadas.some((l) => l.url.includes('fn_aplazar_notificaciones'))).toBe(false);
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

  // RV-08: el plan gratuito de Workers permite 50 peticiones de salida por invocación y cada aviso
  // gasta dos (el push y su resultado). Se reclaman 20: 20 × 2 + 2 = 42.
  it('reclama 20 y responde quedan=true cuando llegan 20', async () => {
    const veinte = Array.from({ length: 20 }, (_, i) => pendiente(i + 1));
    const { espia, llamadas } = fingirRed({ admin: true, pendientes: veinte });
    const r = await onRequestPost({ request: peticion({}, { Authorization: 'Bearer a.b.c' }), env: ENV });
    expect(await r.json()).toEqual({ enviadas: 20, fallidas: 0, sin_anotar: 0, aplazadas: 0, quedan: true });
    expect(llamadas.find((l) => l.url.includes('fn_reclamar_notificaciones'))?.cuerpo).toEqual({ limite: 20 });
    espia.mockRestore();
  });

  it('no hace más de 50 fetch por invocación con 20 avisos', async () => {
    const veinte = Array.from({ length: 20 }, (_, i) => pendiente(i + 1));
    const { espia, llamadas } = fingirRed({ admin: true, pendientes: veinte });
    await onRequestPost({ request: peticion({}, { Authorization: 'Bearer a.b.c' }), env: ENV });
    expect(llamadas.length).toBeLessThanOrEqual(50);
    espia.mockRestore();
  });

  // Un aviso sin anotar se queda reclamado y sale otra vez a los 15 minutos: un duplicado es
  // preferible a una pérdida.
  it('si fn_resultado falla cuenta sin_anotar y no lanza', async () => {
    const { espia } = fingirRed({ admin: true, pendientes: [pendiente(1), pendiente(2)], resultadoCae: true });
    const r = await onRequestPost({ request: peticion({}, { Authorization: 'Bearer a.b.c' }), env: ENV });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ enviadas: 2, fallidas: 0, sin_anotar: 2, aplazadas: 0, quedan: false });
    espia.mockRestore();
  });

  // RV-86: en las pruebas de integración el envío va a un servidor de push falso, con la firma VAPID
  // del servicio de verdad. Fuera de un Supabase local, la variable no cambia nada (DEC-120).
  describe('PUSH_ENDPOINT_PRUEBAS', () => {
    const FCM = {
      ...SUSCRIPCION,
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc:def?x=1',
    };
    const local = {
      ...ENV,
      SUPABASE_URL: 'http://127.0.0.1:55421',
      PUSH_ENDPOINT_PRUEBAS: 'http://127.0.0.1:9912',
    } as Env;

    it('con un Supabase local, el envío va al servidor falso con el mismo camino', async () => {
      const { espia, llamadas } = fingirRed({ admin: true, pendientes: [{ ...pendiente(1), suscripcion: FCM }] });
      const r = await onRequestPost({ request: peticion({}, { Authorization: 'Bearer a.b.c' }), env: local });
      expect(await r.json()).toEqual(expect.objectContaining({ enviadas: 1 }));
      expect(llamadas.some((l) => l.url === 'http://127.0.0.1:9912/fcm/send/abc:def?x=1')).toBe(true);
      expect(llamadas.some((l) => l.url.startsWith('https://fcm.googleapis.com'))).toBe(false);
      espia.mockRestore();
    });

    it('también con localhost en los dos', async () => {
      const { espia, llamadas } = fingirRed({ admin: true, pendientes: [{ ...pendiente(1), suscripcion: FCM }] });
      await onRequestPost({
        request: peticion({}, { Authorization: 'Bearer a.b.c' }),
        env: {
          ...local,
          SUPABASE_URL: 'http://localhost:55421',
          PUSH_ENDPOINT_PRUEBAS: 'http://localhost:9912',
        } as Env,
      });
      expect(llamadas.some((l) => l.url === 'http://localhost:9912/fcm/send/abc:def?x=1')).toBe(true);
      espia.mockRestore();
    });

    it('la firma VAPID sigue siendo para el servicio de verdad (aud)', async () => {
      const { espia } = fingirRed({ admin: true, pendientes: [{ ...pendiente(1), suscripcion: FCM }] });
      await onRequestPost({ request: peticion({}, { Authorization: 'Bearer a.b.c' }), env: local });
      const [, opciones] = espia.mock.calls.find(([u]) => String(u).startsWith('http://127.0.0.1:9912'))!;
      const jwt = /vapid t=([^,]+)/.exec((opciones!.headers as Record<string, string>).Authorization)![1];
      const reclamos = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
      expect(reclamos.aud).toBe('https://fcm.googleapis.com');
      espia.mockRestore();
    });

    it.each([
      ['un Supabase de verdad', { SUPABASE_URL: 'https://proyecto.supabase.co' }],
      ['un servidor falso que no es local', { PUSH_ENDPOINT_PRUEBAS: 'https://atacante.example' }],
      ['un valor que no es una URL', { PUSH_ENDPOINT_PRUEBAS: 'no es una url' }],
    ])('con %s, la variable se ignora', async (_n, cambio) => {
      const { espia, llamadas } = fingirRed({ admin: true, pendientes: [{ ...pendiente(1), suscripcion: FCM }] });
      await onRequestPost({
        request: peticion({}, { Authorization: 'Bearer a.b.c' }),
        env: { ...local, ...cambio } as Env,
      });
      expect(llamadas.some((l) => l.url === FCM.endpoint)).toBe(true);
      expect(llamadas.some((l) => l.url.includes('127.0.0.1:9912') || l.url.includes('atacante'))).toBe(false);
      espia.mockRestore();
    });
  });

  it('con el secreto de la vigilancia correcto entra sin sesión ni token', async () => {
    const { espia } = fingirRed({ pendientes: [] });
    const r = await onRequestPost({ request: peticion({}, { 'X-Vigilancia': 'secreto-de-vigilancia' }), env: ENV });
    expect(r.status).toBe(200);
    espia.mockRestore();
  });
});

// docs/33 RV-304: desde #566 un token de voluntario abre /api/push, así que un móvil en bucle podría
// llamarlo sin parar. 30 por token y hora; por encima, 429 con Retry-After. Jefatura y la vigilancia
// no tienen este tope.
describe('POST /api/push: tope por token (RV-304)', () => {
  afterEach(() => {
    _reiniciarLimites();
    vi.useRealTimers();
  });

  it('más de 30 llamadas por hora con el mismo token: 429 con Retry-After; otro token sigue', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const inicio = Date.now();
    const { espia, llamadas } = fingirRed({ token: true, pendientes: [] });
    const con = (token: string) => onRequestPost({ request: peticion({ token }), env: ENV });
    for (let i = 0; i < LIMITE_PUSH_POR_HORA; i++) {
      vi.setSystemTime(inicio + i * 1000);
      expect((await con('tok_en_bucle_0000000000000001')).status, String(i)).toBe(200);
    }
    const reclamos = llamadas.filter((l) => l.url.includes('fn_reclamar_notificaciones')).length;
    vi.setSystemTime(inicio + 60_000);
    const r = await con('tok_en_bucle_0000000000000001');
    expect(r.status).toBe(429);
    // La primera de la hora deja de contar en inicio + 3600 s: faltan 3540 s.
    expect(r.headers.get('Retry-After')).toBe('3540');
    expect(await r.json()).toEqual({ error: 'DEMASIADOS_INTENTOS', reintentar_en_s: 3540 });
    // Con el tope no se reclama nada.
    expect(llamadas.filter((l) => l.url.includes('fn_reclamar_notificaciones')).length).toBe(reclamos);
    expect((await con('tok_de_otro_movil_000000000002')).status).toBe(200);
    // Pasada la hora desde la primera, vuelve a poder.
    vi.setSystemTime(inicio + 3_600_001);
    expect((await con('tok_en_bucle_0000000000000001')).status).toBe(200);
    expect(LIMITE_PUSH_POR_HORA).toBe(30);
    espia.mockRestore();
  });

  it('un token que no vale no gasta el tope de nadie: sigue siendo 401', async () => {
    const { espia } = fingirRed({ token: false });
    for (let i = 0; i <= LIMITE_PUSH_POR_HORA; i++) {
      expect((await onRequestPost({ request: peticion({ token: 'tok_inventado' }), env: ENV })).status).toBe(401);
    }
    espia.mockRestore();
  });

  it('jefatura y la vigilancia no tienen este tope', async () => {
    const { espia } = fingirRed({ admin: true, pendientes: [] });
    for (let i = 0; i <= LIMITE_PUSH_POR_HORA; i++) {
      const jefatura = peticion({}, { Authorization: 'Bearer aaa.bbb.ccc' });
      expect((await onRequestPost({ request: jefatura, env: ENV })).status, String(i)).toBe(200);
      const vigilancia = peticion({}, { 'X-Vigilancia': 'secreto-de-vigilancia' });
      expect((await onRequestPost({ request: vigilancia, env: ENV })).status, String(i)).toBe(200);
    }
    espia.mockRestore();
  });
});
