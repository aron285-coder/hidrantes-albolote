// La cola se para con un tope (docs/32 RV-232, RV-233) y lo que solo estaba en memoria se guarda en
// cuanto IndexedDB vuelve (RV-231). Antes, con un tope, la pasada seguía con las demás propuestas y
// pedía reservas contra el mismo tope; y la vuelta de la red se saltaba la hora de espera del tope de
// fotos.

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
const { textoEspera } = await import('./nombres-operacion');
const { _reiniciar } = await import('./conexion');
const { guardarSesion } = await import('./sesion');

const TOKEN = 'a'.repeat(43);
const args = (clave: string): ArgumentosPropuesta => ({
  clave_local: clave,
  autor_nombre: 'Ana',
  autor_apellido: 'Ruiz',
  operacion: 'alta',
  punto_id: null,
  datos: {},
  origen: null,
  lat: 37.2,
  lng: -3.65,
  gps_lat: null,
  gps_lng: null,
  precision_gps_m: null,
  exif_lat: null,
  exif_lng: null,
});
const FOTO = new Blob([new Uint8Array([255, 216, 255, 217])], { type: 'image/jpeg' });
const ok = () => ({
  data: { propuesta_id: 'x', estado: 'pendiente', aplicada: false, codigo: null },
  error: null,
  status: 200,
});
const errorRpc = (mensaje: string) => ({ data: null, error: { message: mensaje }, status: 400 });
// 12:00 en Albolote (UTC+2 en octubre).
const MEDIODIA = new Date('2026-10-08T10:00:00Z');

let fetchMock: ReturnType<typeof vi.fn>;
let respuestaReserva: () => Response;
const reservas = () => fetchMock.mock.calls.filter((c) => c[0] === '/api/url-subida').length;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MEDIODIA);
  almacenEnMemoria();
  guardarSesion(TOKEN, { nombre: 'Ana', apellido: 'Ruiz' });
  _reiniciar();
  cola._usarAlmacenCola(colaEnMemoria());
  rpc.mockReset();
  respuestaReserva = () => respuesta(200, { foto_path: 'fotos/x.jpg', url: 'https://sb/subir', caduca_en_s: 7200 });
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/url-subida') return respuestaReserva();
    return new Response(null, { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  _reiniciar();
});

/** Encola `n` altas con foto sin red, y vuelve la red. */
async function encolarSinRed(n: number, foto: Blob | null = FOTO) {
  vi.stubGlobal('navigator', { onLine: false });
  for (let i = 0; i < n; i++) await cola.encolar(args(`k-${String(i).padStart(6, '0')}`), foto, null);
  vi.stubGlobal('navigator', { onLine: true });
}

describe('la cola se para con un tope (RV-232)', () => {
  it('10 altas en cola, la primera da tope de fotos: no se pide ninguna reserva más', async () => {
    respuestaReserva = () => respuesta(429, { error: 'CUOTA_SUBIDAS_AGOTADA(global)' });
    await encolarSinRed(10);
    await cola.procesarCola();
    expect(reservas()).toBe(1);
    expect(rpc).not.toHaveBeenCalled();
    const items = cola.colaActual();
    expect(items).toHaveLength(10);
    for (const i of items) {
      expect(i).toMatchObject({ fallo: null, en_espera: { motivo: 'cuota_fotos_grupo' } });
      expect(i.proximo - Date.now()).toBe(3600_000);
    }
  });

  it('con el tope de propuestas, tampoco se suben las fotos de las demás', async () => {
    rpc.mockResolvedValue(errorRpc('CUOTA_PROPUESTAS_AGOTADA: maximo=60 reintentar_en_s=5000'));
    await encolarSinRed(10);
    await cola.procesarCola();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(reservas()).toBe(1);
    expect(cola.colaActual().every((i) => i.en_espera?.motivo === 'cuota_propuestas')).toBe(true);
  });

  it.each([
    ['SIN_ESPACIO_FOTOS', 'sin_espacio_fotos'],
    ['RESERVAS_ABIERTAS', 'reservas_abiertas'],
    ['CUOTA_SUBIDAS_AGOTADA', 'cuota_fotos'],
  ])('%s en la reserva para toda la cola, sin contar como error', async (codigo, motivo) => {
    respuestaReserva = () => respuesta(codigo.startsWith('CUOTA') ? 429 : 400, { error: codigo });
    await encolarSinRed(3);
    for (let i = 0; i < 6; i++) {
      await cola.procesarCola();
      vi.setSystemTime(cola.colaActual()[0]!.proximo + 1);
    }
    expect(reservas()).toBe(6);
    expect(cola.colaActual().every((i) => !i.fallo && i.en_espera?.motivo === motivo)).toBe(true);
  });

  it('SIN_ESPACIO de fn_proponer es el de la base de datos, no el de las fotos', async () => {
    rpc.mockResolvedValue(errorRpc('SIN_ESPACIO: la base de datos está llena'));
    await encolarSinRed(2, null);
    await cola.procesarCola();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(cola.colaActual().map((i) => i.en_espera?.motivo)).toEqual(['sin_espacio', 'sin_espacio']);
  });

  it('la hora de espera la dice el servidor, si la dice', async () => {
    respuestaReserva = () => respuesta(400, { error: 'SIN_ESPACIO_FOTOS', reintentar_en_s: 600 });
    await encolarSinRed(1);
    await cola.procesarCola();
    expect(cola.colaActual()[0]!.proximo - Date.now()).toBe(600_000);
  });

  it('reintentarCola (vuelta de la red, «Reintentar») no adelanta lo que espera por un tope', async () => {
    respuestaReserva = () => respuesta(429, { error: 'CUOTA_SUBIDAS_AGOTADA' });
    await encolarSinRed(3);
    await cola.procesarCola();
    const antes = cola.colaActual().map((i) => i.proximo);
    await cola.reintentarCola();
    await cola.reintentarCola();
    expect(reservas()).toBe(1);
    expect(cola.colaActual().map((i) => i.proximo)).toEqual(antes);
  });

  it('lo que se encola durante la espera espera con la cola, sin llamar al servidor', async () => {
    respuestaReserva = () => respuesta(429, { error: 'CUOTA_SUBIDAS_AGOTADA(global)' });
    await encolarSinRed(1);
    await cola.procesarCola();
    await cola.encolar(args('k-nueva1'), FOTO, null);
    await cola.procesarCola();
    expect(reservas()).toBe(1);
    const nueva = cola.colaActual().find((i) => i.clave_local === 'k-nueva1')!;
    expect(nueva.en_espera?.motivo).toBe('cuota_fotos_grupo');
    expect(textoEspera(nueva)).toBe(
      'En espera: el grupo ha llegado al máximo de fotos de hoy. Se enviará a las 13:00.',
    );
  });

  it('pasada la hora, sale todo', async () => {
    rpc.mockResolvedValue(ok());
    let topes = 1;
    respuestaReserva = () =>
      topes-- > 0
        ? respuesta(429, { error: 'CUOTA_SUBIDAS_AGOTADA' })
        : respuesta(200, { foto_path: 'fotos/x.jpg', url: 'https://sb/subir', caduca_en_s: 7200 });
    await encolarSinRed(4);
    await cola.procesarCola();
    expect(cola.colaActual()).toHaveLength(4);
    vi.setSystemTime(Date.now() + 3600_000 + 1);
    await cola.procesarCola();
    expect(cola.colaActual()).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(4);
  });

  it('un error permanente de otro envío no se toca', async () => {
    rpc
      .mockResolvedValueOnce(errorRpc('PUNTO_NO_ACTIVO: ya no'))
      .mockResolvedValue(errorRpc('CUOTA_PROPUESTAS_AGOTADA: maximo=60 reintentar_en_s=5000'));
    await encolarSinRed(2, null);
    await cola.procesarCola();
    const [a, b] = cola.colaActual();
    expect(a).toMatchObject({ fallo: 'PUNTO_NO_ACTIVO', en_espera: null });
    expect(b!.en_espera?.motivo).toBe('cuota_propuestas');
  });
});

describe('mensajes de la espera por tope (RV-233)', () => {
  const envio = (motivo: NonNullable<EnCola['en_espera']>['motivo'], proximo: number) => ({
    fallo: null,
    proximo,
    en_espera: { motivo, maximo: null },
  });
  const unaHora = () => Date.now() + 3600_000;

  it.each([
    ['cuota_fotos', 'En espera: has llegado al máximo de fotos de hoy. Se enviará a las 13:00.'],
    ['cuota_fotos_grupo', 'En espera: el grupo ha llegado al máximo de fotos de hoy. Se enviará a las 13:00.'],
    ['sin_espacio_fotos', 'En espera: el servidor no tiene sitio para más fotos. Se volverá a intentar a las 13:00.'],
    ['sin_espacio', 'En espera: el servidor no tiene sitio para más propuestas. Se volverá a intentar a las 13:00.'],
    [
      'reservas_abiertas',
      'En espera: este móvil tiene varias fotos a medio enviar. Se volverá a intentar a las 13:00.',
    ],
  ] as const)('%s', (motivo, texto) => {
    expect(textoEspera(envio(motivo, unaHora()))).toBe(texto);
  });

  it('si la hora es de otro día, dice «mañana»', () => {
    vi.setSystemTime(new Date('2026-10-08T21:30:00Z')); // 23:30 en Albolote
    expect(textoEspera(envio('cuota_fotos', unaHora()))).toBe(
      'En espera: has llegado al máximo de fotos de hoy. Se enviará mañana a las 00:30.',
    );
  });

  it('pasada la hora, ya no dice nada aunque aún no se haya intentado', () => {
    expect(textoEspera(envio('cuota_fotos', Date.now() - 1))).toBeNull();
  });
});

describe('lo que solo estaba en memoria se guarda en cuanto IndexedDB vuelve (RV-231)', () => {
  it('tras un guardado bueno se guarda también lo que antes falló', async () => {
    const almacen = colaEnMemoria<EnCola>();
    const guardarBien = almacen.guardar;
    let roto = true;
    almacen.guardar = async (i) => {
      if (roto) throw new DOMException('Connection to Indexed Database server lost', 'UnknownError');
      return guardarBien(i);
    };
    cola._usarAlmacenCola(almacen);
    vi.stubGlobal('navigator', { onLine: false });
    expect(await cola.encolar(args('k-memoria'), FOTO, null)).toEqual({ persistida: false });
    roto = false;
    expect(await cola.encolar(args('k-disco01'), FOTO, null)).toEqual({ persistida: true });
    await vi.waitFor(() => expect(cola.estaPersistida('k-memoria')).toBe(true));
    expect((await almacen.todos()).map((i) => i.clave_local).sort()).toEqual(['k-disco01', 'k-memoria']);
  });
});
