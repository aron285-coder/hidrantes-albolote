// Cola de envíos (FR-82–FR-84): orden url-subida → PUT → fn_proponer, reintentos sin duplicar,
// errores permanentes y acceso caducado.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { colaEnMemoria } from './bd';
import type { EnCola } from './cola';
import type { ArgumentosPropuesta } from './propuestas';
import { almacenEnMemoria, respuesta } from './pruebas';

const rpc = vi.fn();
vi.mock('./supabase', () => ({
  supabase: () => ({ rpc, auth: { getSession: async () => ({ data: { session: null } }) } }),
}));

const anotarError = vi.fn();
vi.mock('./errores', () => ({ anotarError }));

const cola = await import('./cola');
const { LIMITES_RED } = await import('./red');
const { _reiniciar } = await import('./conexion');
const { guardarSesion } = await import('./sesion');

const TOKEN = 'a'.repeat(43);
const args = (clave: string): ArgumentosPropuesta => ({
  clave_local: clave,
  autor_nombre: 'Ana',
  autor_apellido: 'Ruiz',
  operacion: 'revision',
  punto_id: 'p1',
  datos: {},
  origen: null,
  lat: null,
  lng: null,
  gps_lat: null,
  gps_lng: null,
  precision_gps_m: null,
  exif_lat: null,
  exif_lng: null,
});
const FOTO = new Blob([new Uint8Array([255, 216, 255, 217])], { type: 'image/jpeg' });
const ok = (codigo = 'HID-0147') => ({
  data: { propuesta_id: 'x', estado: 'pendiente', aplicada: false, codigo },
  error: null,
  status: 200,
});
const caido = { data: null, error: { message: 'Failed to fetch' }, status: 0 };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  almacenEnMemoria();
  guardarSesion(TOKEN, { nombre: 'Ana', apellido: 'Ruiz' });
  _reiniciar();
  cola._usarAlmacenCola(colaEnMemoria());
  rpc.mockReset();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/url-subida')
      return respuesta(200, { foto_path: `fotos/${init?.body?.toString().length}.jpg`, url: 'https://sb/subir' });
    return new Response(null, { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  _reiniciar();
});

describe('cola de envíos', () => {
  it('sube la foto, la confirma con fn_proponer y vacía la cola', async () => {
    rpc.mockResolvedValue(ok());
    await cola.encolar(args('k-000001'), FOTO, 'HID-0147');
    await cola.procesarCola();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/url-subida', 'https://sb/subir']);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: TOKEN });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PUT', body: FOTO });
    expect(rpc).toHaveBeenCalledWith(
      'fn_proponer',
      expect.objectContaining({ token: TOKEN, clave_local: 'k-000001', foto_path: expect.stringMatching(/^fotos\//) }),
    );
    expect(cola.colaActual()).toEqual([]);
  });

  it('sin servidor se queda; al volver se reenvía con la misma marca y sin volver a subir la foto', async () => {
    rpc.mockResolvedValueOnce(caido).mockResolvedValueOnce(ok());
    await cola.encolar(args('k-000002'), FOTO, null);
    await cola.procesarCola();
    const [enCola] = cola.colaActual();
    expect(enCola).toMatchObject({ intentos: 1, fallo: null, foto_path: expect.any(String) });

    // Pasado el retroceso, otro intento.
    vi.setSystemTime(Date.now() + 120_000);
    await cola.procesarCola();
    const claves = rpc.mock.calls.map((c) => c[1].clave_local);
    expect(claves).toEqual(['k-000002', 'k-000002']);
    expect(fetchMock.mock.calls.filter((c) => c[0] === '/api/url-subida')).toHaveLength(1);
    expect(cola.colaActual()).toEqual([]);
  });

  it('un error permanente se guarda y no se reintenta (FR-84)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'PUNTO_NO_ACTIVO: ya no' }, status: 400 });
    await cola.encolar(args('k-000003'), FOTO, 'HID-0147');
    await cola.procesarCola();
    await cola.procesarCola();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(cola.colaActual()[0].fallo).toBe('PUNTO_NO_ACTIVO');
    await cola.descartar('k-000003');
    expect(cola.colaActual()).toEqual([]);
  });

  it('foto no reservada: se vuelve a subir en el siguiente intento', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'FOTO_NO_RESERVADA: x' }, status: 400 })
      .mockResolvedValueOnce(ok());
    await cola.encolar(args('k-000004'), FOTO, null);
    await cola.procesarCola();
    expect(cola.colaActual()[0]).toMatchObject({ foto_path: null, fallo: null });
    vi.setSystemTime(Date.now() + 120_000);
    await cola.procesarCola();
    expect(cola.colaActual()).toEqual([]);
    expect(fetchMock.mock.calls.filter((c) => c[0] === '/api/url-subida')).toHaveLength(2);
  });

  it('sin red no se bloquea: al volver la red sale todo (regresión: promesa atascada)', async () => {
    rpc.mockResolvedValue(ok());
    vi.stubGlobal('navigator', { onLine: false });
    await cola.encolar(args('k-000008'), FOTO, null);
    await cola.procesarCola();
    expect(cola.colaActual()).toHaveLength(1);
    vi.stubGlobal('navigator', { onLine: true });
    await cola.reintentarCola();
    expect(cola.colaActual()).toEqual([]);
  });

  it('acceso revocado: la cola espera intacta', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'TOKEN_REVOCADO: x' }, status: 400 });
    await cola.encolar(args('k-000005'), null, 'HID-0147');
    await cola.procesarCola();
    expect(cola.colaActual()[0]).toMatchObject({ fallo: null, intentos: 0 });
  });

  it('avisa de lo enviado y detecta lo atascado más de 24 h (FR-83)', async () => {
    const enviadas: string[] = [];
    cola.alEnviarPropuesta((e) => enviadas.push(e.clave_local));
    rpc.mockResolvedValue(ok());
    await cola.encolar(args('k-000006'), null, 'HID-0147');
    await cola.procesarCola();
    expect(enviadas).toEqual(['k-000006']);

    rpc.mockResolvedValue(caido);
    await cola.encolar(args('k-000007'), null, null);
    expect(cola.atascados(Date.now() + 25 * 3600_000).map((i) => i.clave_local)).toEqual(['k-000007']);
    expect(cola.atascados()).toEqual([]);
  });
});

/** Promesa que el test suelta cuando quiere. */
function retenida<T>() {
  let soltar!: (v: T) => void;
  const promesa = new Promise<T>((r) => (soltar = r));
  return { promesa, soltar };
}

describe('cola: vueltas pedidas durante un envío (RV-01)', () => {
  it('encola durante un envío en curso y sale en la misma llamada', async () => {
    const reserva = retenida<Response>();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/url-subida') return reserva.promesa;
      return new Response(null, { status: 200 });
    });
    rpc.mockResolvedValue(ok());
    await cola.encolar(args('k-000101'), FOTO, 'HID-0147');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await cola.encolar({ ...args('k-000102'), operacion: 'datos', punto_id: 'p2' }, null, 'HID-0148');
    reserva.soltar(respuesta(200, { foto_path: 'fotos/a.jpg', url: 'https://sb/subir' }));
    await cola.procesarCola();
    expect(cola.colaActual()).toEqual([]);
    expect(rpc.mock.calls.map((c) => c[1].clave_local)).toEqual(['k-000101', 'k-000102']);
  });

  it('reintentarCola durante un envío en curso reintenta también lo que esperaba retroceso', async () => {
    rpc.mockResolvedValueOnce(caido);
    await cola.encolar(args('k-000103'), null, 'HID-0147');
    await cola.procesarCola();
    expect(cola.colaActual()[0].proximo).toBeGreaterThan(Date.now());

    const reserva = retenida<Response>();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/url-subida') return reserva.promesa;
      return new Response(null, { status: 200 });
    });
    rpc.mockResolvedValue(ok());
    await cola.encolar(args('k-000104'), FOTO, 'HID-0148');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const reintento = cola.reintentarCola();
    reserva.soltar(respuesta(200, { foto_path: 'fotos/b.jpg', url: 'https://sb/subir' }));
    await reintento;
    expect(cola.colaActual()).toEqual([]);
  });

  it('sin servidor, la vuelta extra no reintenta en bucle', async () => {
    const reserva = retenida<Response>();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/url-subida') return reserva.promesa;
      return new Response(null, { status: 200 });
    });
    rpc.mockResolvedValue(caido);
    await cola.encolar(args('k-000105'), FOTO, 'HID-0147');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await cola.encolar(args('k-000106'), null, 'HID-0148');
    void cola.procesarCola();
    reserva.soltar(respuesta(200, { foto_path: 'fotos/c.jpg', url: 'https://sb/subir' }));
    await cola.procesarCola();
    expect(rpc.mock.calls.length).toBeLessThanOrEqual(2);
    const [a] = cola.colaActual();
    expect(a).toMatchObject({ clave_local: 'k-000105', intentos: 1 });
    expect(a!.proximo).toBeGreaterThan(Date.now());
  });

  it('un PUT que no responde se corta y se reintenta', async () => {
    LIMITES_RED.foto = 30;
    try {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === '/api/url-subida') return respuesta(200, { foto_path: 'fotos/d.jpg', url: 'https://sb/subir' });
        return new Promise<Response>((_, rechazar) =>
          init?.signal?.addEventListener('abort', () => rechazar(init.signal!.reason)),
        );
      });
      rpc.mockResolvedValue(ok());
      await cola.encolar(args('k-000107'), FOTO, null);
      await cola.procesarCola();
      const [a] = cola.colaActual();
      expect(a).toMatchObject({ intentos: 1, fallo: null });
      expect(a!.proximo).toBeGreaterThan(0);
      expect(rpc).not.toHaveBeenCalled();
    } finally {
      LIMITES_RED.foto = 120_000;
    }
  });
});

describe('cola: IndexedDB que falla (RV-02)', () => {
  it('encolar informa persistida=false si IndexedDB falla y sigue enviando', async () => {
    const roto = colaEnMemoria<EnCola>();
    roto.guardar = async () => {
      throw new Error('QuotaExceededError');
    };
    cola._usarAlmacenCola(roto);
    anotarError.mockClear();
    rpc.mockResolvedValue(ok());
    const r = await cola.encolar(args('k-000201'), null, 'HID-0147');
    expect(r).toEqual({ persistida: false });
    await cola.procesarCola();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(cola.colaActual()).toEqual([]);
    expect(anotarError).toHaveBeenCalled();
  });

  it('encolar informa persistida=true con IndexedDB sano', async () => {
    rpc.mockResolvedValue(ok());
    expect(await cola.encolar(args('k-000202'), null, 'HID-0147')).toEqual({ persistida: true });
  });
});
