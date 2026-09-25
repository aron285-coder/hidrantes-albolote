// RV-81: activar los avisos nunca falla en silencio. Un caso por camino, con Notification,
// serviceWorker y PushManager simulados. El límite del Service Worker se inyecta: no se finge el reloj.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { almacenEnMemoria } from './pruebas';

const rpc = vi.fn();
const anotarError = vi.fn();
vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  rpc: (...a: unknown[]) => rpc(...a),
}));
vi.mock('./errores', () => ({ anotarError: (...a: unknown[]) => anotarError(...a) }));

// Clave pública de prueba del RFC 8291 (la misma que functions/api/push.test.ts).
const PUBLICA = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
vi.stubEnv('VITE_VAPID_PUBLIC_KEY', PUBLICA);
const { activarPush, resincronizarPush, RESINCRONIZAR_CADA_MS, sePuedeReintentar, textoMotivoPush } =
  await import('./push');
const { T } = await import('./textos');

const ENDPOINT = `https://fcm.googleapis.com/fcm/send/${'x'.repeat(120)}`;

function bytes(b64url: string): Uint8Array {
  return Uint8Array.from(atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + '='), (c) => c.charCodeAt(0));
}

function suscripcion(clave: Uint8Array = bytes(PUBLICA)) {
  return {
    endpoint: ENDPOINT,
    options: { applicationServerKey: clave.buffer },
    unsubscribe: vi.fn(async () => true),
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } }),
  };
}

let datos: Map<string, string>;
let permiso: NotificationPermission;
let pushManager: { getSubscription: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
let listo: Promise<unknown>;

beforeEach(() => {
  datos = almacenEnMemoria();
  datos.set('hidrantes.token', JSON.stringify('t'.repeat(43)));
  datos.set('hidrantes.firma', JSON.stringify({ nombre: 'Ana', apellido: 'Prueba' }));
  permiso = 'granted';
  pushManager = { getSubscription: vi.fn(async () => null), subscribe: vi.fn(async () => suscripcion()) };
  listo = Promise.resolve({ pushManager });
  vi.stubGlobal('Notification', {
    get permission() {
      return permiso;
    },
    requestPermission: vi.fn(async () => permiso),
  });
  vi.stubGlobal('navigator', {
    userAgent: 'Android',
    serviceWorker: {
      get ready() {
        return listo;
      },
    },
  });
  rpc.mockReset().mockResolvedValue({ ok: true, datos: null });
  anotarError.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const mensajesAnotados = () => anotarError.mock.calls.map(([e]) => String((e as Error).message)).join('\n');

describe('activar los avisos (RV-81)', () => {
  it('todo bien: queda activo y la suscripción llega al servidor', async () => {
    await expect(activarPush()).resolves.toEqual({ estado: 'activo' });
    expect(rpc).toHaveBeenCalledWith(
      'fn_guardar_suscripcion_push',
      expect.objectContaining({ suscripcion: expect.objectContaining({ endpoint: ENDPOINT }) }),
    );
    expect(datos.get('hidrantes.push')).toBe('true');
    expect(anotarError).not.toHaveBeenCalled();
  });

  it('el permiso vuelve como default (Chrome ya no pregunta): permiso_no_concedido', async () => {
    permiso = 'default';
    await expect(activarPush()).resolves.toEqual({ estado: 'inactivo', motivo: 'permiso_no_concedido' });
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('el permiso está bloqueado: denegado, con su motivo', async () => {
    permiso = 'denied';
    await expect(activarPush()).resolves.toEqual({ estado: 'denegado', motivo: 'permiso_bloqueado' });
  });

  it('subscribe lanza: sin_servicio_push, anotado para jefatura y sin el endpoint', async () => {
    pushManager.subscribe.mockRejectedValue(new DOMException('Registration failed - push service error', 'AbortError'));
    await expect(activarPush()).resolves.toEqual({ estado: 'inactivo', motivo: 'sin_servicio_push' });
    expect(anotarError).toHaveBeenCalledWith(expect.any(Error), 'push:subscribe');
    expect(mensajesAnotados()).toContain('AbortError');
    expect(mensajesAnotados()).toContain('push service error');
    expect(mensajesAnotados()).not.toContain('fcm.googleapis.com');
    expect(datos.get('hidrantes.push')).toBeUndefined();
  });

  it('la RPC falla: servidor:<código>, anotado con el código y sin datos', async () => {
    rpc.mockResolvedValue({ ok: false, codigo: 'PAYLOAD_INVALIDO(suscripcion)' });
    await expect(activarPush()).resolves.toEqual({
      estado: 'inactivo',
      motivo: 'servidor:PAYLOAD_INVALIDO(suscripcion)',
    });
    expect(anotarError).toHaveBeenCalledWith(expect.any(Error), 'push:guardar');
    expect(mensajesAnotados()).toContain('PAYLOAD_INVALIDO(suscripcion)');
    expect(mensajesAnotados()).not.toContain('fcm.googleapis.com');
  });

  it('serviceWorker.ready no se resuelve: sin_service_worker al vencer el límite', async () => {
    listo = new Promise(() => undefined);
    const antes = Date.now();
    await expect(activarPush({ limiteSwMs: 30 })).resolves.toEqual({
      estado: 'inactivo',
      motivo: 'sin_service_worker',
    });
    expect(Date.now() - antes).toBeGreaterThanOrEqual(25);
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('una suscripción con otra clave se cambia por una nueva con la clave vigente', async () => {
    const vieja = suscripcion(new Uint8Array(65).fill(4));
    pushManager.getSubscription.mockResolvedValue(vieja);
    await expect(activarPush()).resolves.toEqual({ estado: 'activo' });
    expect(vieja.unsubscribe).toHaveBeenCalledOnce();
    expect(pushManager.subscribe).toHaveBeenCalledOnce();
    const { applicationServerKey } = pushManager.subscribe.mock.calls[0][0] as { applicationServerKey: Uint8Array };
    expect([...applicationServerKey]).toEqual([...bytes(PUBLICA)]);
  });

  it('si no se puede cambiar la suscripción de otra clave: clave_distinta', async () => {
    pushManager.getSubscription.mockResolvedValue(suscripcion(new Uint8Array(65).fill(4)));
    pushManager.subscribe.mockRejectedValue(new Error('InvalidStateError'));
    await expect(activarPush()).resolves.toEqual({ estado: 'inactivo', motivo: 'clave_distinta' });
    expect(anotarError).toHaveBeenCalled();
  });

  it('una suscripción con la misma clave se reutiliza', async () => {
    pushManager.getSubscription.mockResolvedValue(suscripcion());
    await expect(activarPush()).resolves.toEqual({ estado: 'activo' });
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('lo imprevisto tampoco se escapa: requestPermission que lanza', async () => {
    (Notification.requestPermission as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('no es una función'));
    await expect(activarPush()).resolves.toEqual({ estado: 'inactivo', motivo: 'sin_servicio_push' });
    expect(anotarError).toHaveBeenCalledWith(expect.any(Error), 'push:activar');
  });
});

describe('resincronizar la suscripción tras sincronizar (RV-81 punto 4)', () => {
  const token = 't'.repeat(43);

  it('con los avisos activos y sin envío en 24 h, vuelve a guardar la suscripción', async () => {
    datos.set('hidrantes.push', 'true');
    pushManager.getSubscription.mockResolvedValue(suscripcion());
    await resincronizarPush(token, 1_000_000_000_000);
    expect(rpc).toHaveBeenCalledWith('fn_guardar_suscripcion_push', expect.objectContaining({ token }));
    expect(datos.get('hidrantes.push_resincronizado_en')).toBe('1000000000000');
  });

  it('como mucho una vez cada 24 h', async () => {
    datos.set('hidrantes.push', 'true');
    const ahora = 1_000_000_000_000;
    datos.set('hidrantes.push_resincronizado_en', String(ahora - RESINCRONIZAR_CADA_MS + 60_000));
    await resincronizarPush(token, ahora);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('con los avisos apagados no hace nada', async () => {
    await resincronizarPush(token);
    expect(rpc).not.toHaveBeenCalled();
    expect(pushManager.getSubscription).not.toHaveBeenCalled();
  });

  it('sin permiso concedido no hace nada', async () => {
    datos.set('hidrantes.push', 'true');
    permiso = 'default';
    await resincronizarPush(token);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('si el servidor no la acepta, queda anotado y no se reintenta hasta el día siguiente', async () => {
    datos.set('hidrantes.push', 'true');
    pushManager.getSubscription.mockResolvedValue(suscripcion());
    rpc.mockResolvedValue({ ok: false, codigo: 'TOKEN_CADUCADO' });
    const ahora = 1_000_000_000_000;
    await resincronizarPush(token, ahora);
    expect(anotarError).toHaveBeenCalledWith(expect.any(Error), 'push:guardar');
    await resincronizarPush(token, ahora + 60_000);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it('nunca lanza: un Service Worker que no está listo queda anotado', async () => {
    datos.set('hidrantes.push', 'true');
    vi.stubGlobal('navigator', {
      userAgent: 'Android',
      serviceWorker: {
        get ready() {
          return Promise.reject(new Error('sin registro'));
        },
      },
    });
    await expect(resincronizarPush(token)).resolves.toBeUndefined();
    expect(anotarError).toHaveBeenCalledWith(expect.any(Error), 'push:resincronizar');
  });
});

describe('lo que dice la hoja por cada motivo (RV-81, UI-04)', () => {
  it('un texto propio por motivo, y el de sin conexión distinto del de un rechazo del servidor', () => {
    expect(textoMotivoPush('permiso_no_concedido')).toBe(T.push.permisoNoConcedido);
    expect(textoMotivoPush('permiso_bloqueado')).toBe(T.push.permisoBloqueado);
    expect(textoMotivoPush('sin_servicio_push')).toBe(T.push.sinServicioPush);
    expect(textoMotivoPush('sin_service_worker')).toBe(T.push.sinServiceWorker);
    expect(textoMotivoPush('clave_distinta')).toBe(T.push.claveDistinta);
    expect(textoMotivoPush('servidor:SERVIDOR_NO_DISPONIBLE')).toBe(T.push.servidorSinConexion);
    expect(textoMotivoPush('servidor:PAYLOAD_INVALIDO(suscripcion)')).toBe(T.push.servidorNoGuarda);
  });

  it('con el permiso bloqueado no se ofrece reintentar: no cambiaría nada (UI-01)', () => {
    expect(sePuedeReintentar('permiso_bloqueado')).toBe(false);
    expect(sePuedeReintentar('permiso_no_concedido')).toBe(true);
    expect(sePuedeReintentar('servidor:TOKEN_CADUCADO')).toBe(true);
  });
});

/** IndexedDB mínima: solo lo que usan push.ts y sw-push.js (open, get, delete). */
function indexedDbFalsa(inicial: Record<string, unknown>) {
  const kv = new Map(Object.entries(inicial));
  const peticion = <T>(hacer: () => T) => {
    const p: { result?: T; onsuccess?: () => void; onerror?: () => void } = {};
    queueMicrotask(() => {
      p.result = hacer();
      p.onsuccess?.();
    });
    return p;
  };
  const almacen = {
    get: (k: string) => peticion(() => kv.get(k)),
    delete: (k: string) => peticion(() => kv.delete(k)),
  };
  const bd = { transaction: () => ({ objectStore: () => almacen }), close: () => undefined };
  vi.stubGlobal('indexedDB', { open: () => peticion(() => bd) });
  return kv;
}

describe('la suscripción nueva que dejó el Service Worker (pushsubscriptionchange)', () => {
  const token = 't'.repeat(43);
  const ahora = 1_000_000_000_000;

  it('se envía sin esperar a las 24 h y, si el servidor la guarda, se borra la marca', async () => {
    datos.set('hidrantes.push', 'true');
    datos.set('hidrantes.push_resincronizado_en', String(ahora - 2 * 60 * 60 * 1000));
    const kv = indexedDbFalsa({ push_pendiente: true });
    pushManager.getSubscription.mockResolvedValue(suscripcion());
    await resincronizarPush(token, ahora);
    expect(rpc).toHaveBeenCalledWith('fn_guardar_suscripcion_push', expect.objectContaining({ token }));
    expect(kv.has('push_pendiente')).toBe(false);
  });

  it('si el servidor no la guarda, la marca se queda y se reintenta como mucho cada hora', async () => {
    datos.set('hidrantes.push', 'true');
    const kv = indexedDbFalsa({ push_pendiente: true });
    pushManager.getSubscription.mockResolvedValue(suscripcion());
    rpc.mockResolvedValue({ ok: false, codigo: 'DESCONOCIDO' });
    await resincronizarPush(token, ahora);
    await resincronizarPush(token, ahora + 10 * 60 * 1000);
    expect(rpc).toHaveBeenCalledOnce();
    expect(kv.has('push_pendiente')).toBe(true);
    await resincronizarPush(token, ahora + 61 * 60 * 1000);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

describe('sin cobertura no se molesta a jefatura', () => {
  it('activar sin servidor dice el motivo pero no anota un error', async () => {
    rpc.mockResolvedValue({ ok: false, codigo: 'SERVIDOR_NO_DISPONIBLE' });
    await expect(activarPush()).resolves.toEqual({ estado: 'inactivo', motivo: 'servidor:SERVIDOR_NO_DISPONIBLE' });
    expect(anotarError).not.toHaveBeenCalled();
  });
});

describe('apagar los avisos mientras se resincroniza', () => {
  it('no vuelve a guardar una suscripción que el voluntario acaba de apagar', async () => {
    datos.set('hidrantes.push', 'true');
    pushManager.getSubscription.mockImplementation(async () => {
      datos.set('hidrantes.push', 'false');
      return null;
    });
    await resincronizarPush('t'.repeat(43));
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
