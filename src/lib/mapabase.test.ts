// Mapa base sin cobertura (FR-81, docs/17 RV-10): si falta, se descarga en cuanto la conexión lo
// permite, no solo al arrancar; nunca dos descargas a la vez; con datos móviles no se descarga solo.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import info from '../../datos/mapabase.json';

/** Un PMTiles v3 del tamaño esperado: los 7 bytes de la firma, la versión y ceros. */
function pmtiles(tamano = info.bytes, version = 3, firma = 'PMTiles'): Uint8Array {
  const b = new Uint8Array(tamano);
  b.set([...firma].map((c) => c.charCodeAt(0)));
  b[7] = version;
  return b;
}
let cuerpo: Uint8Array;

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
  cuerpo = pmtiles();
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
      return new Response(new Blob([cuerpo as BlobPart]), { headers: { 'content-length': String(cuerpo.length) } });
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

// docs/19 RV-68: un archivo cualquiera (una página de error, uno a medias) no se guarda como mapa base.
describe('el mapa base se valida antes de guardarlo (RV-68)', () => {
  for (const [caso, mal] of [
    ['sin la firma PMTiles', () => pmtiles(info.bytes, 3, 'NoTiles')],
    ['con otra versión del encabezado', () => pmtiles(info.bytes, 2)],
    ['con un tamaño lejos del esperado (más del 1 %)', () => pmtiles(Math.round(info.bytes * 0.9))],
  ] as const) {
    it(`${caso}: fallo y no se guarda`, async () => {
      prepararEntorno({ enLinea: true, tipo: 'cellular' });
      cuerpo = mal();
      const m = await cargar();
      expect(await m.descargarMapabase()).toBe(false);
      expect(m.estadoMapabase()).toMatchObject({ fallo: true, descargado: null });
      expect(guardado.size).toBe(0);
    });
  }

  it('dentro del 1 % de tamaño, con firma y versión 3, se guarda', async () => {
    prepararEntorno({ enLinea: true, tipo: 'cellular' });
    cuerpo = pmtiles(Math.round(info.bytes * 1.005));
    const m = await cargar();
    expect(await m.descargarMapabase()).toBe(true);
    expect(guardado.size).toBe(1);
  });
});
