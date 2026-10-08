// docs/31 RV-167: los avisos de jefatura nunca se quedan colgados ni fallan en silencio. Con
// Notification, serviceWorker y PushManager simulados; el límite del Service Worker se inyecta.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { almacenEnMemoria } from '../pruebas';

const rpc = vi.fn();
const anotarError = vi.fn();
vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  rpc: (...a: unknown[]) => rpc(...a),
}));
vi.mock('../errores', () => ({ anotarError: (...a: unknown[]) => anotarError(...a) }));
vi.mock('./consultas', () => ({ jwt: async () => null }));

// Clave pública de prueba del RFC 8291 (la misma que functions/api/push.test.ts).
vi.stubEnv(
  'VITE_VAPID_PUBLIC_KEY',
  'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
);
const { cargarTemas, fijarTemas } = await import('./push-jefatura');

const ENDPOINT = `https://fcm.googleapis.com/fcm/send/${'x'.repeat(120)}`;
const suscripcion = () => ({
  endpoint: ENDPOINT,
  unsubscribe: vi.fn(async () => true),
  toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } }),
});

let datos: Map<string, string>;
let pushManager: { getSubscription: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
let listo: Promise<unknown>;

beforeEach(() => {
  datos = almacenEnMemoria();
  pushManager = { getSubscription: vi.fn(async () => null), subscribe: vi.fn(async () => suscripcion()) };
  listo = Promise.resolve({ pushManager });
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn(async () => 'granted') });
  vi.stubGlobal('navigator', {
    userAgent: 'Windows',
    serviceWorker: {
      get ready() {
        return listo;
      },
    },
  });
  rpc.mockReset().mockResolvedValue({ ok: true, datos: 'id' });
  anotarError.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const anotado = () => anotarError.mock.calls.map(([e]) => String((e as Error).message)).join('\n');

describe('avisos de jefatura (docs/31 RV-167)', () => {
  it('todo bien: queda el tema y la suscripción llega al servidor', async () => {
    await expect(fijarTemas(['nuevas_propuestas'])).resolves.toEqual({ temas: ['nuevas_propuestas'], ok: true });
    expect(rpc).toHaveBeenCalledWith(
      'fn_guardar_suscripcion_push_admin',
      expect.objectContaining({ temas: ['nuevas_propuestas'] }),
    );
    // Nada se recuerda en el navegador (docs/32 RV-264).
    expect(datos.get('hidrantes.push_jefatura')).toBeUndefined();
  });

  it('un Service Worker que nunca está listo no deja el interruptor colgado', async () => {
    listo = new Promise(() => undefined);
    await expect(fijarTemas(['nuevas_propuestas'], { limiteSwMs: 20 })).resolves.toEqual({ temas: [], ok: false });
    expect(anotado()).toMatch(/serviceWorker\.ready/);
  });

  it('subscribe() que falla se dice y se anota, sin el endpoint', async () => {
    pushManager.subscribe.mockRejectedValue(new DOMException('push service error', 'AbortError'));
    await expect(fijarTemas(['resumen_semanal'])).resolves.toEqual({ temas: [], ok: false });
    expect(rpc).not.toHaveBeenCalled();
    expect(anotado()).toMatch(/subscribe/);
    expect(anotado()).not.toContain(ENDPOINT);
  });

  it('el servidor que no la guarda se dice, y los temas siguen como estaban', async () => {
    rpc.mockResolvedValue({ ok: false, codigo: 'PAYLOAD_INVALIDO(suscripcion)' });
    await expect(fijarTemas(['resumen_semanal', 'nuevas_propuestas'], { antes: ['resumen_semanal'] })).resolves.toEqual(
      { temas: ['resumen_semanal'], ok: false },
    );
    expect(anotado()).toMatch(/fn_guardar_suscripcion_push_admin: PAYLOAD_INVALIDO/);
  });

  it('quitar todos borra en el servidor solo la de jefatura de este navegador', async () => {
    const s = suscripcion();
    pushManager.getSubscription.mockResolvedValue(s);
    await expect(fijarTemas([], { antes: ['resumen_semanal'] })).resolves.toEqual({ temas: [], ok: true });
    expect(rpc).toHaveBeenCalledWith('fn_borrar_suscripcion_push_admin', { endpoint: ENDPOINT });
  });

  it('si el servidor no la borra, se dice, se anota y los temas siguen', async () => {
    const s = suscripcion();
    pushManager.getSubscription.mockResolvedValue(s);
    rpc.mockResolvedValue({ ok: false, codigo: 'NO_AUTORIZADO' });
    await expect(fijarTemas([], { antes: ['resumen_semanal'] })).resolves.toEqual({
      temas: ['resumen_semanal'],
      ok: false,
    });
    expect(anotado()).toMatch(/fn_borrar_suscripcion_push_admin: NO_AUTORIZADO/);
  });

  it('con temas ya activos, un Service Worker colgado los deja como estaban', async () => {
    listo = new Promise(() => undefined);
    await expect(
      fijarTemas(['nuevas_propuestas', 'resumen_semanal'], { antes: ['nuevas_propuestas'], limiteSwMs: 20 }),
    ).resolves.toEqual({ temas: ['nuevas_propuestas'], ok: false });
  });

  it('sin permiso no es un fallo de la aplicación: se dice, sin anotar', async () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn(async () => 'default') });
    await expect(fijarTemas(['nuevas_propuestas'])).resolves.toEqual({ temas: [], ok: false });
    expect(anotarError).not.toHaveBeenCalled();
  });
});

// docs/32 RV-264: con dos administradores en el mismo navegador, cada uno ve y apaga solo lo suyo.
// Antes los temas salían de localStorage (los del último que los tocó) y apagarlos daba de baja la
// suscripción del navegador, con lo que el otro administrador dejaba de recibir los suyos.
describe('avisos de jefatura por administrador (docs/32 RV-264)', () => {
  /** El servidor: una fila por administrador y endpoint, y el administrador que llama. */
  let filas: Map<string, string[]>;
  let quien: string;
  beforeEach(() => {
    filas = new Map([['a@example.org', ['nuevas_propuestas', 'resumen_semanal']]]);
    quien = 'a@example.org';
    pushManager.getSubscription.mockResolvedValue(suscripcion());
    rpc.mockReset().mockImplementation(async (nombre: string, args: { endpoint?: string; temas?: string[] }) => {
      if (args.endpoint !== undefined && args.endpoint !== ENDPOINT) return { ok: false, codigo: 'PAYLOAD_INVALIDO' };
      if (nombre === 'fn_suscripcion_push_admin') {
        const t = filas.get(quien);
        return { ok: true, datos: { suscrita: !!t, temas: t ?? [] } };
      }
      if (nombre === 'fn_borrar_suscripcion_push_admin') {
        filas.delete(quien);
        return { ok: true, datos: null };
      }
      if (nombre === 'fn_guardar_suscripcion_push_admin') {
        filas.set(quien, args.temas ?? []);
        return { ok: true, datos: 'id' };
      }
      return { ok: false, codigo: 'NO_SIMULADA' };
    });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }), PushManager: class {}, Notification: {} });
  });

  it('los temas se leen del servidor: cada administrador ve los suyos', async () => {
    await expect(cargarTemas()).resolves.toEqual({ ok: true, datos: ['nuevas_propuestas', 'resumen_semanal'] });
    quien = 'b@example.org';
    await expect(cargarTemas()).resolves.toEqual({ ok: true, datos: [] });
    expect(rpc).toHaveBeenCalledWith('fn_suscripcion_push_admin', { endpoint: ENDPOINT });
  });

  it('lo que recordaba el navegador de antes se borra y no cuenta', async () => {
    datos.set('hidrantes.push_jefatura', JSON.stringify(['resumen_semanal']));
    quien = 'b@example.org';
    await expect(cargarTemas()).resolves.toEqual({ ok: true, datos: [] });
    expect(datos.has('hidrantes.push_jefatura')).toBe(false);
  });

  it('desactivar los de B no toca los de A ni da de baja el navegador', async () => {
    const s = suscripcion();
    pushManager.getSubscription.mockResolvedValue(s);
    quien = 'b@example.org';
    await fijarTemas(['resumen_semanal']);
    expect(filas.get('b@example.org')).toEqual(['resumen_semanal']);
    await expect(fijarTemas([], { antes: ['resumen_semanal'] })).resolves.toEqual({ temas: [], ok: true });
    expect(filas.has('b@example.org')).toBe(false);
    expect(filas.get('a@example.org')).toEqual(['nuevas_propuestas', 'resumen_semanal']);
    expect(s.unsubscribe).not.toHaveBeenCalled();
    quien = 'a@example.org';
    await expect(cargarTemas()).resolves.toEqual({ ok: true, datos: ['nuevas_propuestas', 'resumen_semanal'] });
  });

  it('sin suscripción en el navegador, ninguno, sin preguntar al servidor', async () => {
    pushManager.getSubscription.mockResolvedValue(null);
    await expect(cargarTemas()).resolves.toEqual({ ok: true, datos: [] });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('si el servidor no contesta, es un error que se dice (no «ninguno»)', async () => {
    rpc.mockResolvedValue({ ok: false, codigo: 'NO_AUTORIZADO' });
    await expect(cargarTemas()).resolves.toEqual({ ok: false, codigo: 'NO_AUTORIZADO' });
    expect(anotado()).toMatch(/fn_suscripcion_push_admin: NO_AUTORIZADO/);
  });

  it('un tema que el panel no conoce no se enseña', async () => {
    filas.set('a@example.org', ['nuevas_propuestas', 'otro']);
    await expect(cargarTemas()).resolves.toEqual({ ok: true, datos: ['nuevas_propuestas'] });
  });
});
