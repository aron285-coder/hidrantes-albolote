// Sincronización incremental (05 §10), búsqueda, filtros y orden (FR-68, FR-69).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { almacenEnMemoria } from './bd';
import type { Punto } from './puntos';

const rpc = vi.fn();
vi.mock('./supabase', () => ({ supabase: () => ({ rpc }) }));

const { _usarAlmacen, aplicarListado, buscar, cargarGuardados, estadoPuntos, filtrar, metros, ordenar, sincronizar } =
  await import('./puntos');
const { _reiniciar } = await import('./conexion');

const p = (id: string, extra: Partial<Punto> = {}): Punto => ({
  id,
  codigo: `HID-${id}`,
  tipo: 'hidrante',
  diametro_mm: 100,
  caudal: 'bueno',
  racor: null,
  descripcion_fallo: null,
  descripcion: null,
  direccion: null,
  foto_path: null,
  municipio: 'albolote',
  nucleo: 'Albolote',
  fecha_ultima_revision: '2026-08-01',
  actualizado_en: '2026-09-01T00:00:00Z',
  lat: 37.23,
  lng: -3.65,
  radio_px: 11,
  revision_caducada: false,
  ...extra,
});

const ok = (datos: unknown) => ({ data: datos, error: null, status: 200 });
const TOKEN = 't'.repeat(43);

beforeEach(() => {
  _reiniciar();
  _usarAlmacen(almacenEnMemoria<Punto>());
  rpc.mockReset();
});
afterEach(() => _reiniciar());

describe('sincronización (05 §10)', () => {
  it('primera carga completa; después incremental con el sello del servidor, reemplazo por id y bajas', async () => {
    rpc.mockResolvedValueOnce(ok({ puntos: [p('1'), p('2')], bajas: [], sincronizado_en: 'S1' }));
    expect(await sincronizar(TOKEN)).toEqual({ ok: true, datos: null });
    expect(rpc).toHaveBeenLastCalledWith('fn_listar_puntos', { token: TOKEN, desde: null });

    rpc.mockResolvedValueOnce(
      ok({ puntos: [p('2', { caudal: 'malo' }), p('3')], bajas: ['1'], sincronizado_en: 'S2' }),
    );
    await sincronizar(TOKEN);
    expect(rpc).toHaveBeenLastCalledWith('fn_listar_puntos', { token: TOKEN, desde: 'S1' });
    const e = estadoPuntos();
    expect(e.puntos.map((x) => [x.id, x.caudal]).sort()).toEqual([
      ['2', 'malo'],
      ['3', 'bueno'],
    ]);
    expect(e.sincronizadoEn).toBe('S2');
  });

  it('lo guardado sobrevive a reabrir la app sin red', async () => {
    const almacen = almacenEnMemoria<Punto>();
    _usarAlmacen(almacen);
    rpc.mockResolvedValueOnce(ok({ puntos: [p('1')], bajas: [], sincronizado_en: 'S1' }));
    await sincronizar(TOKEN);
    _usarAlmacen(almacen); // "reinicio": estado en blanco, mismo almacén
    await cargarGuardados();
    expect(estadoPuntos()).toMatchObject({ cargado: true, sincronizadoEn: 'S1' });
    expect(estadoPuntos().puntos).toHaveLength(1);
  });

  it('un error no toca lo guardado y se devuelve para que acceso decida', async () => {
    rpc.mockResolvedValueOnce(ok({ puntos: [p('1')], bajas: [], sincronizado_en: 'S1' }));
    await sincronizar(TOKEN);
    rpc.mockResolvedValueOnce({ data: null, status: 400, error: { message: 'TOKEN_REVOCADO: x' } });
    expect(await sincronizar(TOKEN)).toEqual({ ok: false, codigo: 'TOKEN_REVOCADO' });
    expect(estadoPuntos().puntos).toHaveLength(1);
  });

  it('dos llamadas a la vez comparten la misma petición', async () => {
    rpc.mockResolvedValue(ok({ puntos: [], bajas: [], sincronizado_en: 'S1' }));
    await Promise.all([sincronizar(TOKEN), sincronizar(TOKEN)]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('aplicarListado completo descarta lo anterior', () => {
    const r = aplicarListado([p('1')], { puntos: [p('2')], bajas: [], sincronizado_en: 'x' }, true);
    expect(r.map((x) => x.id)).toEqual(['2']);
  });
});

describe('búsqueda, filtros y orden', () => {
  const lista = [
    p('0147', { direccion: 'Calle Real 14', descripcion: 'Junto al ayuntamiento', lat: 37.24 }),
    p('0003', { tipo: 'boca_riego', caudal: 'no_funciona', nucleo: 'Cortijo del Aire', lat: 37.2301 }),
    p('0088', { caudal: 'regular', revision_caducada: true, descripcion: 'Frente a la farmacia', lat: 37.25 }),
  ];

  it('busca por código, calle, descripción y núcleo sin tildes ni mayúsculas', () => {
    expect(buscar(lista, 'hid-0147').map((x) => x.id)).toEqual(['0147']);
    expect(buscar(lista, 'REAL 14').map((x) => x.id)).toEqual(['0147']);
    expect(buscar(lista, 'farmácia').map((x) => x.id)).toEqual(['0088']);
    expect(buscar(lista, 'cortijo aire').map((x) => x.id)).toEqual(['0003']);
    expect(buscar(lista, '  ')).toHaveLength(3);
  });

  it('filtros rápidos de FR-68', () => {
    expect(filtrar(lista, 'bocas').map((x) => x.id)).toEqual(['0003']);
    expect(filtrar(lista, 'hidrantes')).toHaveLength(2);
    expect(filtrar(lista, 'no_funciona').map((x) => x.id)).toEqual(['0003']);
    expect(filtrar(lista, 'sin_revisar').map((x) => x.id)).toEqual(['0088']);
  });

  it('orden por distancia, código o estado; sin posición, por código', () => {
    const aqui = { lat: 37.23, lng: -3.65 };
    expect(ordenar(lista, 'distancia', aqui).map((x) => x.id)).toEqual(['0003', '0147', '0088']);
    expect(ordenar(lista, 'distancia', null).map((x) => x.id)).toEqual(['0003', '0088', '0147']);
    expect(ordenar(lista, 'estado', null).map((x) => x.id)).toEqual(['0147', '0088', '0003']);
  });

  it('distancias en metros razonables', () => {
    expect(Math.round(metros({ lat: 37.23, lng: -3.65 }, { lat: 37.24, lng: -3.65 }))).toBe(1112);
  });
});
