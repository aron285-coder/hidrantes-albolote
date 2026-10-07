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
const { fijarTemas } = await import('./push-jefatura');

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
    expect(datos.get('hidrantes.push_jefatura')).toBe('["nuevas_propuestas"]');
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
    datos.set('hidrantes.push_jefatura', JSON.stringify(['resumen_semanal']));
    rpc.mockResolvedValue({ ok: false, codigo: 'PAYLOAD_INVALIDO(suscripcion)' });
    await expect(fijarTemas(['resumen_semanal', 'nuevas_propuestas'])).resolves.toEqual({
      temas: ['resumen_semanal'],
      ok: false,
    });
    expect(anotado()).toMatch(/fn_guardar_suscripcion_push_admin/);
  });

  it('sin permiso no es un fallo de la aplicación: se dice, sin anotar', async () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn(async () => 'default') });
    await expect(fijarTemas(['nuevas_propuestas'])).resolves.toEqual({ temas: [], ok: false });
    expect(anotarError).not.toHaveBeenCalled();
  });
});
