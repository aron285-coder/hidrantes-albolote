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
const pedirEnvioPush = vi.fn();
vi.mock('./push', () => ({ pedirEnvioPush }));
vi.mock('./panel/push-jefatura', () => ({ pedirEnvioComoJefatura: vi.fn(async () => undefined) }));

const cola = await import('./cola');
const { textoEspera } = await import('./nombres-operacion');
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

describe('cola: errores desconocidos y fallidos (RV-03)', () => {
  const desconocido = { data: null, error: { message: 'PGRST202 Could not find the function' }, status: 404 };

  it('un error desconocido se reintenta y no marca fallo', async () => {
    rpc.mockResolvedValueOnce(desconocido).mockResolvedValueOnce(ok());
    await cola.encolar(args('k-000301'), null, 'HID-0147');
    await cola.procesarCola();
    expect(cola.colaActual()[0]).toMatchObject({ fallo: null, intentos: 1 });
    vi.setSystemTime(Date.now() + 120_000);
    await cola.procesarCola();
    expect(cola.colaActual()).toEqual([]);
  });

  it('cinco desconocidos seguidos marcan fallo', async () => {
    rpc.mockResolvedValue(desconocido);
    await cola.encolar(args('k-000302'), null, 'HID-0147');
    for (let i = 0; i < 5; i++) {
      await cola.procesarCola();
      vi.setSystemTime(Date.now() + 3600_000);
    }
    expect(rpc).toHaveBeenCalledTimes(5);
    expect(cola.colaActual()[0].fallo).toBe('DESCONOCIDO');
    await cola.procesarCola();
    expect(rpc).toHaveBeenCalledTimes(5);
  });

  it('reintentarFallido vuelve a enviar un envío fallido', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'PAYLOAD_INVALIDO(x): y' }, status: 400 });
    await cola.encolar(args('k-000303'), null, 'HID-0147');
    await cola.procesarCola();
    expect(cola.colaActual()[0].fallo).toBe('PAYLOAD_INVALIDO(x)');
    rpc.mockResolvedValueOnce(ok());
    await cola.reintentarFallido('k-000303');
    expect(cola.colaActual()).toEqual([]);
  });

  it('NO_AUTORIZADO (sesión de jefatura caducada) se reintenta con retroceso', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'JWT expired' }, status: 401 });
    await cola.encolar(args('k-000304'), null, 'HID-0147');
    await cola.procesarCola();
    expect(cola.colaActual()[0]).toMatchObject({ fallo: null, intentos: 1 });
  });

  it('DIAMETRO_SIN_FIJAR marca fallo y no reintenta', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'DIAMETRO_SIN_FIJAR: fija' }, status: 400 });
    await cola.encolar(args('k-000305'), null, null);
    await cola.procesarCola();
    await cola.procesarCola();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(cola.colaActual()[0].fallo).toBe('DIAMETRO_SIN_FIJAR');
  });
});

describe('cola: cerrar sesión durante un envío (RV-04)', () => {
  it('cerrar sesión durante la subida no resucita el envío', async () => {
    let soltar!: (r: Response) => void;
    const put = new Promise<Response>((r) => (soltar = r));
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/url-subida') return respuesta(200, { foto_path: 'fotos/e.jpg', url: 'https://sb/subir' });
      return put;
    });
    const almacen = colaEnMemoria<EnCola>();
    cola._usarAlmacenCola(almacen);
    rpc.mockResolvedValue(ok());
    await cola.encolar(args('k-000401'), FOTO, 'HID-0147');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await cola.vaciarCola();
    soltar(new Response(null, { status: 200 }));
    await cola.procesarCola();
    await new Promise((r) => setTimeout(r, 10));
    expect(cola.colaActual()).toEqual([]);
    expect(await almacen.todos()).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('cola: avisos al momento (RV-08)', () => {
  it('un fn_proponer bueno pide el envío de avisos, una vez por llamada', async () => {
    pedirEnvioPush.mockClear();
    rpc.mockResolvedValue(ok());
    await cola.encolar(args('k-000501'), null, 'HID-0147');
    await cola.encolar(args('k-000502'), null, 'HID-0148');
    await cola.procesarCola();
    expect(cola.colaActual()).toEqual([]);
    expect(pedirEnvioPush).toHaveBeenCalledTimes(1);
    expect(pedirEnvioPush).toHaveBeenCalledWith(TOKEN);
  });

  it('sin nada enviado no pide nada', async () => {
    pedirEnvioPush.mockClear();
    rpc.mockResolvedValue(caido);
    await cola.encolar(args('k-000503'), null, 'HID-0147');
    await cola.procesarCola();
    expect(pedirEnvioPush).not.toHaveBeenCalled();
  });
});

describe('cola: cabos sueltos de RV-01 a RV-04 (docs/18 RV-39)', () => {
  it('tras cerrar sesión durante un PUT, lo encolado después sale sin esperar a la red', async () => {
    const put = retenida<Response>();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/url-subida') return respuesta(200, { foto_path: 'fotos/f.jpg', url: 'https://sb/subir' });
      return put.promesa;
    });
    rpc.mockResolvedValue(ok());
    await cola.encolar(args('k-000501'), FOTO, 'HID-0147');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    // Cierra sesión con el PUT en vuelo, vuelve a entrar y envía otra propuesta.
    await cola.vaciarCola();
    guardarSesion(TOKEN, { nombre: 'Ana', apellido: 'Ruiz' });
    await cola.encolar(args('k-000502'), null, 'HID-0148');
    put.soltar(new Response(null, { status: 200 }));
    await cola.procesarCola();
    expect(rpc.mock.calls.map((c) => c[1].clave_local)).toEqual(['k-000502']);
    expect(cola.colaActual()).toEqual([]);
  });

  it('reintentarCola tras vaciarCola no resucita nada', async () => {
    const almacen = colaEnMemoria<EnCola>();
    cola._usarAlmacenCola(almacen);
    rpc.mockResolvedValue(caido);
    await cola.encolar(args('k-000503'), null, 'HID-0147');
    await cola.procesarCola();
    expect(cola.colaActual()[0].proximo).toBeGreaterThan(Date.now());
    const llamadas = rpc.mock.calls.length;
    // El reintento se queda a medio guardar; mientras, se cierra sesión.
    const retenido = retenida<void>();
    const original = almacen.guardar.bind(almacen);
    almacen.guardar = async (i) => {
      await retenido.promesa;
      return original(i);
    };
    rpc.mockResolvedValue(ok());
    const reintento = cola.reintentarCola();
    await cola.vaciarCola();
    retenido.soltar();
    await reintento;
    expect(cola.colaActual()).toEqual([]);
    expect(await almacen.todos()).toEqual([]);
    expect(rpc.mock.calls.length).toBe(llamadas);
  });

  it('reintentarFallido tras vaciarCola no resucita nada', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'PAYLOAD_INVALIDO(x): y' }, status: 400 });
    const almacen = colaEnMemoria<EnCola>();
    cola._usarAlmacenCola(almacen);
    await cola.encolar(args('k-000505'), null, 'HID-0147');
    await cola.procesarCola();
    expect(cola.colaActual()[0].fallo).toBe('PAYLOAD_INVALIDO(x)');
    const retenido = retenida<void>();
    const guardarOriginal = almacen.guardar.bind(almacen);
    almacen.guardar = async (i) => {
      await retenido.promesa;
      return guardarOriginal(i);
    };
    rpc.mockResolvedValue(ok());
    const reintento = cola.reintentarFallido('k-000505');
    await cola.vaciarCola();
    retenido.soltar();
    await reintento;
    expect(cola.colaActual()).toEqual([]);
    expect(await almacen.todos()).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('estaPersistida dice si un envío llegó a IndexedDB, y un reintento vuelve a intentarlo', async () => {
    const almacen = colaEnMemoria<EnCola>();
    const guardarOriginal = almacen.guardar.bind(almacen);
    let roto = true;
    almacen.guardar = async (i) => {
      if (roto) throw new Error('QuotaExceededError');
      return guardarOriginal(i);
    };
    cola._usarAlmacenCola(almacen);
    rpc.mockResolvedValue(caido);
    const r = await cola.encolar(args('k-000506'), null, 'HID-0147');
    expect(r.persistida).toBe(false);
    expect(cola.estaPersistida('k-000506')).toBe(false);
    roto = false;
    await cola.reintentarCola();
    expect(cola.estaPersistida('k-000506')).toBe(true);
  });
});

describe('cola: los topes nuevos (docs/31 RV-154)', () => {
  const cuota = (mensaje: string) => ({ data: null, error: { message: mensaje }, status: 400 });

  it('CUOTA_PROPUESTAS_AGOTADA espera a la hora que dice el servidor, sin contar como error', async () => {
    rpc.mockResolvedValue(cuota('CUOTA_PROPUESTAS_AGOTADA: maximo=60 reintentar_en_s=5000'));
    await cola.encolar(args('k-000701'), null, 'HID-0147');
    await cola.procesarCola();
    const [a] = cola.colaActual();
    expect(a).toMatchObject({ fallo: null, fallos_seguidos: 0, en_espera: { motivo: 'cuota_propuestas', maximo: 60 } });
    expect(a!.proximo - Date.now()).toBe(5000_000);
    expect(textoEspera(a!)).toBe('Has llegado al máximo de propuestas de hoy (60). Se enviará mañana.');
  });

  it('seis topes seguidos no lo marcan como fallo', async () => {
    rpc.mockResolvedValue(cuota('CUOTA_PROPUESTAS_AGOTADA: maximo=60 reintentar_en_s=10'));
    await cola.encolar(args('k-000702'), null, null);
    for (let i = 0; i < 6; i++) {
      vi.setSystemTime(Date.now() + 20_000);
      await cola.procesarCola();
    }
    expect(rpc.mock.calls.length).toBeGreaterThanOrEqual(6);
    expect(cola.colaActual()[0]).toMatchObject({ fallo: null });
  });

  it('sin los números en el texto, espera a la próxima medianoche y el aviso va sin número', async () => {
    vi.setSystemTime(new Date(2026, 9, 7, 22, 0, 0));
    rpc.mockResolvedValue(cuota('CUOTA_PROPUESTAS_AGOTADA: otra cosa'));
    await cola.encolar(args('k-000703'), null, null);
    await cola.procesarCola();
    const [a] = cola.colaActual();
    expect(a!.proximo).toBeGreaterThanOrEqual(new Date(2026, 9, 8, 0, 0, 0).getTime());
    expect(a!.proximo).toBeLessThan(new Date(2026, 9, 8, 0, 30, 0).getTime());
    expect(textoEspera(a!)).toBe('Has llegado al máximo de propuestas de hoy. Se enviará mañana.');
  });

  it('un reintento (vuelta de la red, «Reintentar») no adelanta la espera del tope', async () => {
    rpc.mockResolvedValue(cuota('CUOTA_PROPUESTAS_AGOTADA: maximo=60 reintentar_en_s=5000'));
    await cola.encolar(args('k-000706'), null, null);
    await cola.procesarCola();
    const llamadas = rpc.mock.calls.length;
    const proximo = cola.colaActual()[0]!.proximo;
    await cola.reintentarCola();
    expect(rpc.mock.calls.length).toBe(llamadas);
    expect(cola.colaActual()[0]!.proximo).toBe(proximo);
  });

  it('al enviarse después, el aviso se va', async () => {
    rpc.mockResolvedValueOnce(cuota('CUOTA_PROPUESTAS_AGOTADA: maximo=60 reintentar_en_s=10'));
    await cola.encolar(args('k-000704'), null, null);
    await cola.procesarCola();
    rpc.mockResolvedValueOnce(caido);
    vi.setSystemTime(Date.now() + 20_000);
    await cola.procesarCola();
    expect(textoEspera(cola.colaActual()[0]!)).toBeNull();
  });

  it('CUOTA_SUBIDAS_AGOTADA del tope global (con sufijo) espera una hora y no es fallo', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/url-subida') return respuesta(429, { error: 'CUOTA_SUBIDAS_AGOTADA(global)' });
      return new Response(null, { status: 200 });
    });
    await cola.encolar(args('k-000705'), FOTO, null);
    for (let i = 0; i < 6; i++) {
      await cola.procesarCola();
      const [a] = cola.colaActual();
      expect(a).toMatchObject({ fallo: null });
      expect(a!.proximo - Date.now()).toBe(3600_000);
      vi.setSystemTime(a!.proximo + 1);
    }
  });
});

describe('cola: reintentar sin escribir una copia vieja (docs/31 RV-156)', () => {
  /** Retiene la primera escritura en el almacén hasta soltarla. */
  function retenerPrimeraEscritura(almacen: ReturnType<typeof colaEnMemoria<EnCola>>) {
    const retenido = retenida<void>();
    let primera = true;
    const envolver =
      <A extends unknown[], R>(f: (...a: A) => Promise<R>) =>
      async (...a: A): Promise<R> => {
        if (primera) {
          primera = false;
          await retenido.promesa;
        }
        return f(...a);
      };
    almacen.guardar = envolver(almacen.guardar.bind(almacen));
    const conActualizar = almacen as { actualizar?: (...a: never[]) => Promise<unknown> };
    if (conActualizar.actualizar) conActualizar.actualizar = envolver(conActualizar.actualizar.bind(almacen));
    return retenido;
  }

  it('un reintento durante una pasada no resucita un enviado', async () => {
    const almacen = colaEnMemoria<EnCola>();
    cola._usarAlmacenCola(almacen);
    rpc.mockResolvedValue(caido);
    await cola.encolar(args('k-000601'), null, null);
    await cola.procesarCola();
    await cola.encolar(args('k-000602'), null, null);
    await cola.procesarCola();
    expect(cola.colaActual().every((i) => i.proximo > Date.now())).toBe(true);

    rpc.mockReset();
    rpc.mockResolvedValue(ok());
    const retenido = retenerPrimeraEscritura(almacen);
    const reintento = cola.reintentarCola();
    // Mientras el reintento espera a IndexedDB, una pasada envía los dos.
    vi.setSystemTime(Date.now() + 600_000);
    await cola.procesarCola();
    expect(cola.colaActual()).toEqual([]);
    retenido.soltar();
    await reintento;

    expect(cola.colaActual()).toEqual([]);
    expect(await almacen.todos()).toEqual([]);
    expect(rpc.mock.calls.map((c) => c[1].clave_local).sort()).toEqual(['k-000601', 'k-000602']);
  });

  it('un reintento no pisa la ruta de una foto recién subida', async () => {
    const almacen = colaEnMemoria<EnCola>();
    cola._usarAlmacenCola(almacen);
    // Primer intento: la reserva no responde; el envío espera sin ruta de foto.
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError('Failed to fetch');
    });
    rpc.mockResolvedValue(caido);
    await cola.encolar(args('k-000603'), FOTO, null);
    await cola.procesarCola();
    expect(cola.colaActual()[0]).toMatchObject({ foto_path: null });

    // El reintento se queda a medio guardar; mientras, una pasada sube la foto (y fn_proponer falla).
    const retenido = retenerPrimeraEscritura(almacen);
    const reintento = cola.reintentarCola();
    vi.setSystemTime(Date.now() + 600_000);
    await cola.procesarCola();
    const ruta = cola.colaActual()[0]!.foto_path;
    expect(ruta).toEqual(expect.any(String));
    retenido.soltar();
    await reintento;

    const [guardado] = await almacen.todos();
    expect(guardado!.foto_path).toBe(ruta);
  });

  it('una sola escucha de la vuelta de la red: la de conexion', () => {
    const escuchas: string[] = [];
    vi.stubGlobal('window', { addEventListener: (tipo: string) => escuchas.push(tipo) });
    cola.iniciarCola();
    expect(escuchas).not.toContain('online');
  });
});

describe('cola: una reserva por foto mientras no caduque (docs/31 RV-156)', () => {
  const reservas = () => fetchMock.mock.calls.filter((c) => c[0] === '/api/url-subida').length;
  const puts = () => fetchMock.mock.calls.filter((c) => c[0] === 'https://sb/subir').length;
  let putOk = false;

  beforeEach(() => {
    putOk = false;
    let n = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/url-subida')
        return respuesta(200, { foto_path: `fotos/r${++n}.jpg`, url: 'https://sb/subir', caduca_en_s: 7200 });
      return new Response(null, { status: putOk ? 200 : 503 });
    });
    rpc.mockResolvedValue(ok());
  });

  it('tres fallos de subida seguidos usan una sola reserva', async () => {
    await cola.encolar(args('k-000801'), FOTO, null);
    await cola.procesarCola();
    for (let i = 0; i < 2; i++) {
      vi.setSystemTime(Date.now() + 120_000);
      await cola.procesarCola();
    }
    expect(puts()).toBe(3);
    expect(reservas()).toBe(1);

    putOk = true;
    vi.setSystemTime(Date.now() + 120_000);
    await cola.procesarCola();
    expect(reservas()).toBe(1);
    expect(rpc).toHaveBeenCalledWith('fn_proponer', expect.objectContaining({ foto_path: 'fotos/r1.jpg' }));
    expect(cola.colaActual()).toEqual([]);
  });

  it('con la reserva caducada se pide otra', async () => {
    await cola.encolar(args('k-000802'), FOTO, null);
    await cola.procesarCola();
    vi.setSystemTime(Date.now() + 3 * 3600_000);
    putOk = true;
    await cola.procesarCola();
    expect(reservas()).toBe(2);
    expect(rpc).toHaveBeenCalledWith('fn_proponer', expect.objectContaining({ foto_path: 'fotos/r2.jpg' }));
  });

  it('con FOTO_NO_RESERVADA se pide otra', async () => {
    putOk = true;
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'FOTO_NO_RESERVADA: x' }, status: 400 })
      .mockResolvedValueOnce(ok());
    await cola.encolar(args('k-000803'), FOTO, null);
    await cola.procesarCola();
    vi.setSystemTime(Date.now() + 120_000);
    await cola.procesarCola();
    expect(reservas()).toBe(2);
    expect(rpc).toHaveBeenLastCalledWith('fn_proponer', expect.objectContaining({ foto_path: 'fotos/r2.jpg' }));
  });

  it('si la subida anterior llegó pero no su respuesta, el «ya existe» cuenta como subida', async () => {
    await cola.encolar(args('k-000804'), FOTO, null);
    await cola.procesarCola();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/url-subida') return respuesta(200, { foto_path: 'fotos/otra.jpg', url: 'https://sb/subir' });
      return respuesta(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
    });
    vi.setSystemTime(Date.now() + 120_000);
    await cola.procesarCola();
    expect(rpc).toHaveBeenCalledWith('fn_proponer', expect.objectContaining({ foto_path: 'fotos/r1.jpg' }));
    expect(cola.colaActual()).toEqual([]);
  });
});

describe('cola: el tipo no se cambia (docs/18 RV-41)', () => {
  it('TIPO_NO_MODIFICABLE es permanente: no se reintenta', () => {
    expect(cola.esPermanente('TIPO_NO_MODIFICABLE')).toBe(true);
  });
});
