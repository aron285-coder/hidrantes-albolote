// docs/24 RV-103 (DEC-146, DEC-150): la foto del sitio en la cola. Dos reservas y dos PUT antes de
// fn_proponer; la firma nueva lleva siempre la clave foto_sitio_path; un envío guardado por la
// versión anterior (sin el campo) se manda con la firma vieja y no se pierde nada.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { colaEnMemoria } from './bd';
import type { EnCola } from './cola';
import type { ArgumentosPropuesta } from './propuestas';
import { almacenEnMemoria, respuesta } from './pruebas';

const rpc = vi.fn();
vi.mock('./supabase', () => ({
  supabase: () => ({ rpc, auth: { getSession: async () => ({ data: { session: null } }) } }),
}));
vi.mock('./errores', () => ({ anotarError: vi.fn() }));
vi.mock('./push', () => ({ pedirEnvioPush: vi.fn() }));
vi.mock('./panel/push-jefatura', () => ({ pedirEnvioComoJefatura: vi.fn(async () => undefined) }));

const cola = await import('./cola');
const { _reiniciar } = await import('./conexion');
const { guardarSesion } = await import('./sesion');

const TOKEN = 'a'.repeat(43);
const args = (clave: string, operacion: ArgumentosPropuesta['operacion'] = 'alta'): ArgumentosPropuesta => ({
  clave_local: clave,
  autor_nombre: 'Ana',
  autor_apellido: 'Ruiz',
  operacion,
  punto_id: operacion === 'alta' ? null : 'p1',
  datos: {},
  origen: operacion === 'alta' || operacion === 'ubicacion' ? 'gps' : null,
  lat: 37.23,
  lng: -3.65,
  gps_lat: null,
  gps_lng: null,
  precision_gps_m: null,
  exif_lat: null,
  exif_lng: null,
});
const CONEXION = new Blob([new Uint8Array([255, 216, 1, 255, 217])], { type: 'image/jpeg' });
const SITIO = new Blob([new Uint8Array([255, 216, 2, 2, 255, 217])], { type: 'image/jpeg' });
const ok = {
  data: { propuesta_id: 'x', estado: 'pendiente', aplicada: false, codigo: null },
  error: null,
  status: 200,
};

let fetchMock: ReturnType<typeof vi.fn>;
let reservas = 0;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  almacenEnMemoria();
  guardarSesion(TOKEN, { nombre: 'Ana', apellido: 'Ruiz' });
  _reiniciar();
  cola._usarAlmacenCola(colaEnMemoria());
  rpc.mockReset();
  reservas = 0;
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/url-subida') {
      reservas++;
      return respuesta(200, { foto_path: `fotos/${reservas}.jpg`, url: `https://sb/subir/${reservas}` });
    }
    return new Response(null, { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  _reiniciar();
});

const puts = () => fetchMock.mock.calls.filter((c) => c[1]?.method === 'PUT').map((c) => c[1].body);

describe('foto del sitio en la cola (RV-103)', () => {
  it('alta con dos fotos: dos reservas, dos PUT y una llamada con los dos paths', async () => {
    rpc.mockResolvedValue(ok);
    await cola.encolar(args('k-sitio-01'), CONEXION, null, SITIO);
    await cola.procesarCola();
    expect(reservas).toBe(2);
    expect(puts()).toEqual([CONEXION, SITIO]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toMatchObject({ foto_path: 'fotos/1.jpg', foto_sitio_path: 'fotos/2.jpg' });
    expect(cola.colaActual()).toEqual([]);
  });

  it('las demás operaciones mandan la clave foto_sitio_path a null (firma nueva)', async () => {
    rpc.mockResolvedValue(ok);
    await cola.encolar(args('k-sitio-02', 'revision'), CONEXION, 'HID-0147');
    await cola.procesarCola();
    expect(reservas).toBe(1);
    expect(rpc.mock.calls[0][1]).toHaveProperty('foto_sitio_path', null);
  });

  it('un envío guardado por la versión anterior, sin el campo, sale con la firma vieja', async () => {
    rpc.mockResolvedValue(ok);
    const viejo: EnCola = {
      clave_local: 'k-sitio-03',
      creada_en: Date.now() - 1000,
      args: args('k-sitio-03'),
      foto: CONEXION,
      foto_path: null,
      codigo: null,
      intentos: 0,
      proximo: 0,
      fallo: null,
    };
    const almacen = colaEnMemoria<EnCola>();
    await almacen.guardar(viejo);
    cola._usarAlmacenCola(almacen);
    await cola.cargarCola();
    expect(cola.colaActual()).toHaveLength(1);
    await cola.procesarCola();
    expect(reservas).toBe(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('foto_sitio_path');
    expect(cola.colaActual()).toEqual([]);
  });

  it('FOTO_NO_RESERVADA solo de la del sitio: se sube otra vez solo esa', async () => {
    rpc
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'FOTO_NO_RESERVADA: La foto del sitio no se subió desde este móvil' },
        status: 400,
      })
      .mockResolvedValueOnce(ok);
    await cola.encolar(args('k-sitio-04'), CONEXION, null, SITIO);
    await cola.procesarCola();
    expect(cola.colaActual()[0]).toMatchObject({ foto_path: 'fotos/1.jpg', foto_sitio_path: null, fallo: null });
    vi.setSystemTime(Date.now() + 120_000);
    await cola.procesarCola();
    expect(reservas).toBe(3);
    expect(puts()).toEqual([CONEXION, SITIO, SITIO]);
    expect(rpc.mock.calls[1][1]).toMatchObject({ foto_path: 'fotos/1.jpg', foto_sitio_path: 'fotos/3.jpg' });
  });

  it('FOTO_NO_RESERVADA de la de la conexión: se sube otra vez solo esa', async () => {
    rpc
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'FOTO_NO_RESERVADA: La foto no se subió desde este móvil' },
        status: 400,
      })
      .mockResolvedValueOnce(ok);
    await cola.encolar(args('k-sitio-05'), CONEXION, null, SITIO);
    await cola.procesarCola();
    vi.setSystemTime(Date.now() + 120_000);
    await cola.procesarCola();
    expect(puts()).toEqual([CONEXION, SITIO, CONEXION]);
    expect(rpc.mock.calls[1][1]).toMatchObject({ foto_path: 'fotos/3.jpg', foto_sitio_path: 'fotos/2.jpg' });
  });

  it('FOTO_SITIO_OBLIGATORIA es permanente: no se reintenta y se enseña', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'FOTO_SITIO_OBLIGATORIA: Falta la foto del sitio' },
      status: 400,
    });
    await cola.encolar(args('k-sitio-06'), CONEXION, null, null);
    await cola.procesarCola();
    await cola.procesarCola();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(cola.colaActual()[0].fallo).toBe('FOTO_SITIO_OBLIGATORIA');
  });
});
