// public/sw-push.js cargado en un contexto de `vm` con `self`, `clients` y `WindowClient` simulados.
// docs/21 RV-83: tocar un aviso debe llevar a "Mis propuestas", también si el SW no controla la ventana.
// docs/21 RV-81: `pushsubscriptionchange` deja la suscripción nueva para que la app la envíe.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
// Los nombres que lee src/lib/push.ts (BD_SW), sacados de su código: si uno cambia, este test lo nota.
const PUSH_TS = readFileSync(path.resolve(import.meta.dirname, '../src/lib/push.ts'), 'utf8');
const campo = (c: string) =>
  new RegExp(`${c}: '([^']+)'`).exec(/export const BD_SW = {([^}]+)}/.exec(PUSH_TS)![1]!)![1]!;
const BD_SW = { nombre: campo('nombre'), almacen: campo('almacen'), pendiente: campo('pendiente') };

const CODIGO = readFileSync(path.resolve(import.meta.dirname, '../public/sw-push.js'), 'utf8');
const ORIGEN = 'https://hidrantes-albolote-staging.pages.dev';

type Oyente = (e: unknown) => void;

interface Ventana {
  url: string;
  navigate: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
}

function ventana(url = `${ORIGEN}/`): Ventana {
  const v: Ventana = {
    url,
    navigate: vi.fn(async () => v),
    focus: vi.fn(async () => v),
  };
  return v;
}

/** Carga el SW con las ventanas que el navegador devolvería: controladas y no controladas. */
function cargar({ controladas = [] as Ventana[], sinControlar = [] as Ventana[] } = {}) {
  const oyentes: Record<string, Oyente[]> = {};
  const kv = new Map<string, unknown>();
  const clients = {
    matchAll: vi.fn(async (o?: { includeUncontrolled?: boolean }) =>
      o?.includeUncontrolled ? [...controladas, ...sinControlar] : controladas,
    ),
    openWindow: vi.fn(async () => null),
  };
  const suscribir = vi.fn(async () => ({ toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/nueva' }) }));
  const self = {
    location: { origin: ORIGEN },
    clients,
    registration: { pushManager: { subscribe: suscribir }, showNotification: vi.fn() },
    addEventListener: (tipo: string, f: Oyente) => (oyentes[tipo] ??= []).push(f),
  };
  // IndexedDB mínima, con los nombres que lee src/lib/push.ts.
  const peticion = <T>(hacer: () => T) => {
    const p: { result?: T; onsuccess?: () => void; onupgradeneeded?: () => void; onerror?: () => void } = {};
    queueMicrotask(() => {
      p.result = hacer();
      p.onsuccess?.();
    });
    return p;
  };
  const indexedDB = {
    open: vi.fn((nombre: string) => {
      expect(nombre).toBe(BD_SW.nombre);
      return peticion(() => ({
        close: () => undefined,
        transaction: (almacen: string) => {
          expect(almacen).toBe(BD_SW.almacen);
          const tx: Record<string, unknown> = {
            objectStore: () => ({
              put: (v: unknown, k: string) => {
                kv.set(k, v);
                queueMicrotask(() => (tx.oncomplete as () => void)?.());
              },
            }),
          };
          return tx;
        },
      }));
    }),
  };
  vm.runInNewContext(CODIGO, { self, caches: { keys: async () => [], delete: async () => true }, indexedDB, URL });
  const lanzar = async (tipo: string, datos: Record<string, unknown>) => {
    let espera: Promise<unknown> | undefined;
    const evento = { ...datos, waitUntil: vi.fn((p: Promise<unknown>) => (espera = p)) };
    for (const f of oyentes[tipo] ?? []) f(evento);
    await espera;
    return evento;
  };
  return { clients, lanzar, kv, suscribir };
}

const aviso = (url?: string) => ({ notification: { close: vi.fn(), data: url ? { url } : {} } });

describe('tocar un aviso (RV-83)', () => {
  it('con una ventana de la app que el SW controla, la lleva a Mis propuestas y la enfoca', async () => {
    const v = ventana();
    const sw = cargar({ controladas: [v] });
    const evento = await sw.lanzar('notificationclick', aviso());
    expect(v.navigate).toHaveBeenCalledWith(`${ORIGEN}/mis-propuestas`);
    expect(v.focus).toHaveBeenCalled();
    expect(sw.clients.openWindow).not.toHaveBeenCalled();
    expect(evento.waitUntil).toHaveBeenCalledWith(expect.any(Promise));
  });

  it('sin ventana controlada (recién instalada), abre una nueva en vez de navegar la que no controla', async () => {
    const suelta = ventana();
    const sw = cargar({ sinControlar: [suelta] });
    await sw.lanzar('notificationclick', aviso('/mis-propuestas'));
    expect(suelta.navigate).not.toHaveBeenCalled();
    expect(sw.clients.openWindow).toHaveBeenCalledWith(`${ORIGEN}/mis-propuestas`);
  });

  it('una ventana de otro origen no se navega', async () => {
    const otra = ventana('https://ejemplo.org/');
    const sw = cargar({ controladas: [otra] });
    await sw.lanzar('notificationclick', aviso());
    expect(otra.navigate).not.toHaveBeenCalled();
    expect(sw.clients.openWindow).toHaveBeenCalled();
  });

  it('si navegar falla, abre una ventana nueva: el aviso nunca se queda en nada', async () => {
    const v = ventana();
    v.navigate.mockRejectedValue(new TypeError('no controlada'));
    const sw = cargar({ controladas: [v] });
    await sw.lanzar('notificationclick', aviso());
    expect(sw.clients.openWindow).toHaveBeenCalledWith(`${ORIGEN}/mis-propuestas`);
  });

  it('si el foco falla, navega igual y no abre una segunda ventana', async () => {
    const v = ventana();
    v.focus.mockRejectedValue(new Error('InvalidAccessError'));
    const sw = cargar({ controladas: [v] });
    await sw.lanzar('notificationclick', aviso());
    expect(v.navigate).toHaveBeenCalledWith(`${ORIGEN}/mis-propuestas`);
    expect(sw.clients.openWindow).not.toHaveBeenCalled();
  });

  it('navigate que resuelve null (la ventana se fue a otro origen) no abre otra', async () => {
    const v = ventana();
    v.navigate.mockResolvedValue(null);
    const sw = cargar({ controladas: [v] });
    await sw.lanzar('notificationclick', aviso());
    expect(sw.clients.openWindow).not.toHaveBeenCalled();
  });

  it('si abrir una ventana falla, se intenta una sola vez y waitUntil no queda rechazado', async () => {
    const sw = cargar();
    sw.clients.openWindow.mockRejectedValue(new TypeError('sin gesto del usuario'));
    const evento = await sw.lanzar('notificationclick', aviso());
    expect(sw.clients.openWindow).toHaveBeenCalledOnce();
    await expect(evento.waitUntil.mock.calls[0]![0]).resolves.toBeNull();
  });
});

describe('la suscripción cambia (RV-81, pushsubscriptionchange)', () => {
  it('con la suscripción nueva del navegador, la deja para la app en la base y clave de push.ts', async () => {
    const sw = cargar();
    const nueva = { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/b' }) };
    await sw.lanzar('pushsubscriptionchange', { newSubscription: nueva, oldSubscription: null });
    expect(sw.kv.get(BD_SW.pendiente)).toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/b' });
  });

  it('sin suscripción nueva, se vuelve a suscribir con la clave de la vieja', async () => {
    const sw = cargar();
    const clave = new Uint8Array([4, 1, 2]).buffer;
    await sw.lanzar('pushsubscriptionchange', { oldSubscription: { options: { applicationServerKey: clave } } });
    expect(sw.suscribir).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: clave });
    expect(sw.kv.get(BD_SW.pendiente)).toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/nueva' });
  });

  it('sin suscripción nueva ni clave vieja, deja al menos la marca', async () => {
    const sw = cargar();
    await sw.lanzar('pushsubscriptionchange', {});
    expect(sw.suscribir).not.toHaveBeenCalled();
    expect(sw.kv.get(BD_SW.pendiente)).toBe(true);
  });

  it('si volver a suscribirse falla, también deja la marca', async () => {
    const sw = cargar();
    sw.suscribir.mockRejectedValue(new Error('AbortError'));
    await sw.lanzar('pushsubscriptionchange', {
      oldSubscription: { options: { applicationServerKey: new ArrayBuffer(3) } },
    });
    expect(sw.kv.get(BD_SW.pendiente)).toBe(true);
  });
});
