// Mapa base sin cobertura (FR-81, docs/17 RV-10): si falta, se descarga en cuanto la conexión lo
// permite, no solo al arrancar; nunca dos descargas a la vez; con datos móviles no se descarga solo.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class Conexion extends EventTarget {
  constructor(public type: string) {
    super();
  }
}

let conexion: Conexion;
let ventana: EventTarget;
let guardado: Map<string, Response>;
let pedidas: number;
let soltar: (() => void) | null;

function prepararEntorno({ enLinea, tipo, retener = false }: { enLinea: boolean; tipo: string; retener?: boolean }) {
  conexion = new Conexion(tipo);
  ventana = new EventTarget();
  guardado = new Map();
  pedidas = 0;
  soltar = null;
  vi.stubGlobal('navigator', { onLine: enLinea, connection: conexion });
  vi.stubGlobal('window', ventana);
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  });
  vi.stubGlobal('caches', {
    open: async () => ({
      match: async (url: string) => guardado.get(url),
      put: async (url: string, r: Response) => void guardado.set(url, r),
    }),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      pedidas++;
      if (retener) await new Promise<void>((r) => (soltar = r));
      return new Response(new Uint8Array(1000), { headers: { 'content-length': '1000' } });
    }),
  );
}

async function cargar() {
  vi.resetModules();
  return import('./mapabase');
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('descarga del mapa base (RV-10, FR-81)', () => {
  it('descarga al volver la red si falta y la conexión lo permite', async () => {
    prepararEntorno({ enLinea: false, tipo: 'wifi' });
    const m = await cargar();
    await m.iniciarMapabase();
    expect(pedidas).toBe(0);
    (navigator as { onLine: boolean }).onLine = true;
    ventana.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(m.estadoMapabase().descargado).not.toBeNull());
    expect(pedidas).toBe(1);
  });

  it('descarga al pasar de datos móviles a wifi', async () => {
    prepararEntorno({ enLinea: true, tipo: 'cellular' });
    const m = await cargar();
    await m.iniciarMapabase();
    expect(pedidas).toBe(0);
    conexion.type = 'wifi';
    conexion.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(m.estadoMapabase().descargado).not.toBeNull());
  });

  it('no lanza dos descargas a la vez', async () => {
    prepararEntorno({ enLinea: true, tipo: 'wifi', retener: true });
    const m = await cargar();
    const arranque = m.iniciarMapabase();
    await vi.waitFor(() => expect(pedidas).toBe(1));
    ventana.dispatchEvent(new Event('online'));
    conexion.dispatchEvent(new Event('change'));
    void m.descargarMapabase();
    soltar!();
    await arranque;
    expect(pedidas).toBe(1);
  });

  it('con datos móviles no descarga solo', async () => {
    prepararEntorno({ enLinea: true, tipo: 'cellular' });
    const m = await cargar();
    await m.iniciarMapabase();
    ventana.dispatchEvent(new Event('online'));
    conexion.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 10));
    expect(pedidas).toBe(0);
    expect(m.estadoMapabase().descargado).toBeNull();
  });
});
