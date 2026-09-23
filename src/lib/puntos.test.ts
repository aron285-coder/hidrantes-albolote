// Sincronización incremental (05 §10), búsqueda, filtros y orden (FR-68, FR-69).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { almacenEnMemoria } from './bd';
import type { Punto } from './puntos';

const rpc = vi.fn();
/** Lectura de v_puntos_activos de jefatura: responde según el rango pedido (RV-15). */
const pagina = vi.fn<(desde: number, hasta: number) => Promise<{ data: unknown; error: unknown; status: number }>>();
vi.mock('./supabase', () => ({
  supabase: () => ({
    rpc,
    from: () => ({ select: () => ({ order: () => ({ range: (d: number, h: number) => pagina(d, h) }) }) }),
  }),
}));

const {
  _usarAlmacen,
  aplicarListado,
  borrarPuntos,
  buscar,
  cargarGuardados,
  estadoPuntos,
  filtrar,
  metros,
  metrosTramoManguera,
  ordenar,
  rederivarSiCambiaElDia,
  sincronizar,
} = await import('./puntos');
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

describe('el móvil deriva radio_px y revision_caducada (RV-05, FR-61, FR-142)', () => {
  const haceMeses = (n: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d.getDate(), 28)).padStart(2, '0')}`;
  };

  it('una sincronización incremental vacía marca caducado un punto que cruzó el umbral', async () => {
    const guardado = almacenEnMemoria<Punto>();
    await guardado.reemplazar([p('1', { fecha_ultima_revision: haceMeses(13), revision_caducada: false })], []);
    await guardado.escribirMeta('sincronizado_en', 'S1');
    _usarAlmacen(guardado);
    await cargarGuardados();
    rpc.mockResolvedValueOnce(
      ok({
        puntos: [],
        bajas: [],
        sincronizado_en: 'S2',
        config: { meses_revision: 12, escala_radios: [11, 9, 7, 5.5, 5] },
      }),
    );
    await sincronizar(TOKEN);
    expect(rpc).toHaveBeenLastCalledWith('fn_listar_puntos', { token: TOKEN, desde: 'S1' });
    expect(estadoPuntos().puntos[0].revision_caducada).toBe(true);
  });

  it('cambiar escala_radios cambia el radio de puntos no modificados', async () => {
    rpc.mockResolvedValueOnce(
      ok({
        puntos: [p('1')],
        bajas: [],
        sincronizado_en: 'S1',
        config: { meses_revision: 12, escala_radios: [11, 9, 7, 5.5, 5] },
      }),
    );
    await sincronizar(TOKEN);
    expect(estadoPuntos().puntos[0].radio_px).toBe(11);
    rpc.mockResolvedValueOnce(
      ok({
        puntos: [],
        bajas: [],
        sincronizado_en: 'S2',
        config: { meses_revision: 12, escala_radios: [14, 12, 9, 7, 6] },
      }),
    );
    await sincronizar(TOKEN);
    expect(estadoPuntos().puntos[0].radio_px).toBe(14);
  });

  it('al arrancar sin red se re-deriva con la config guardada', async () => {
    const guardado = almacenEnMemoria<Punto>();
    await guardado.reemplazar(
      [p('1', { fecha_ultima_revision: haceMeses(2), revision_caducada: false, radio_px: 11 })],
      [],
    );
    await guardado.escribirMeta('config', { meses_revision: 1, escala_radios: [20, 15, 10, 6, 3] });
    _usarAlmacen(guardado);
    await cargarGuardados();
    expect(estadoPuntos().puntos[0]).toMatchObject({ radio_px: 20, revision_caducada: true });
  });

  it('una config que no sirve no borra la guardada', async () => {
    rpc.mockResolvedValueOnce(
      ok({
        puntos: [p('1')],
        bajas: [],
        sincronizado_en: 'S1',
        config: { meses_revision: 12, escala_radios: [14, 12, 9, 7, 6] },
      }),
    );
    await sincronizar(TOKEN);
    rpc.mockResolvedValueOnce(ok({ puntos: [], bajas: [], sincronizado_en: 'S2', config: { escala_radios: 'x' } }));
    await sincronizar(TOKEN);
    expect(estadoPuntos().puntos[0].radio_px).toBe(14);
  });

  it('al cambiar el día se re-deriva sin red', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(2026, 8, 22, 12));
      rpc.mockResolvedValueOnce(
        ok({
          puntos: [p('1', { fecha_ultima_revision: '2025-09-22' })],
          bajas: [],
          sincronizado_en: 'S1',
          config: { meses_revision: 12, escala_radios: [11, 9, 7, 5.5, 5] },
        }),
      );
      await sincronizar(TOKEN);
      expect(estadoPuntos().puntos[0].revision_caducada).toBe(false);
      rederivarSiCambiaElDia();
      expect(estadoPuntos().puntos[0].revision_caducada).toBe(false);
      vi.setSystemTime(new Date(2026, 8, 23, 9));
      rederivarSiCambiaElDia();
      expect(estadoPuntos().puntos[0].revision_caducada).toBe(true);
      expect(rpc).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('sincronización completa cuando hace falta (RV-06)', () => {
  const cfg = (epoca: string | null) => ({ meses_revision: 12, escala_radios: [11, 9, 7, 5.5, 5], epoca_datos: epoca });

  it('una época de datos distinta fuerza la sincronización completa', async () => {
    rpc.mockResolvedValueOnce(ok({ puntos: [p('1'), p('2')], bajas: [], sincronizado_en: 'S1', config: cfg('E1') }));
    await sincronizar(TOKEN);
    rpc
      .mockResolvedValueOnce(ok({ puntos: [], bajas: [], sincronizado_en: 'S2', config: cfg('E2') }))
      .mockResolvedValueOnce(ok({ puntos: [p('3')], bajas: [], sincronizado_en: 'S3', config: cfg('E2') }));
    expect(await sincronizar(TOKEN)).toEqual({ ok: true, datos: null });
    expect(rpc.mock.calls.slice(1).map((c) => c[1].desde)).toEqual(['S1', null]);
    expect(estadoPuntos().puntos.map((x) => x.id)).toEqual(['3']);
    expect(estadoPuntos().sincronizadoEn).toBe('S3');
    // Y la siguiente ya es incremental con la época nueva.
    rpc.mockResolvedValueOnce(ok({ puntos: [], bajas: [], sincronizado_en: 'S4', config: cfg('E2') }));
    await sincronizar(TOKEN);
    expect(rpc).toHaveBeenLastCalledWith('fn_listar_puntos', { token: TOKEN, desde: 'S3' });
  });

  it('la primera época (null → valor) no fuerza nada', async () => {
    rpc.mockResolvedValueOnce(ok({ puntos: [p('1')], bajas: [], sincronizado_en: 'S1', config: cfg(null) }));
    await sincronizar(TOKEN);
    rpc.mockResolvedValueOnce(ok({ puntos: [], bajas: [], sincronizado_en: 'S2', config: cfg('E1') }));
    await sincronizar(TOKEN);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(estadoPuntos().puntos.map((x) => x.id)).toEqual(['1']);
  });

  it('siete días sin completa fuerzan una completa', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      rpc.mockResolvedValue(ok({ puntos: [p('1')], bajas: [], sincronizado_en: 'S1', config: cfg('E1') }));
      await sincronizar(TOKEN);
      vi.setSystemTime(Date.now() + 6 * 24 * 3600_000);
      await sincronizar(TOKEN);
      expect(rpc).toHaveBeenLastCalledWith('fn_listar_puntos', { token: TOKEN, desde: 'S1' });
      vi.setSystemTime(Date.now() + 2 * 24 * 3600_000);
      await sincronizar(TOKEN);
      expect(rpc).toHaveBeenLastCalledWith('fn_listar_puntos', { token: TOKEN, desde: null });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('jefatura lee por páginas (RV-15, TR-60)', () => {
  const muchos = (desde: number, n: number) => Array.from({ length: n }, (_, i) => p(String(desde + i)));

  it('jefatura lee por páginas hasta tener todo', async () => {
    pagina.mockReset();
    pagina.mockImplementation(async (desde) => ({
      data: desde === 0 ? muchos(0, 1000) : desde === 1000 ? muchos(1000, 1000) : muchos(2000, 5),
      error: null,
      status: 200,
    }));
    expect(await sincronizar(null)).toEqual({ ok: true, datos: null });
    expect(pagina.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    expect(estadoPuntos().puntos).toHaveLength(2005);
  });

  it('un error en la segunda página no reemplaza el almacén', async () => {
    pagina.mockReset();
    pagina.mockResolvedValueOnce({ data: muchos(0, 3), error: null, status: 200 });
    await sincronizar(null);
    expect(estadoPuntos().puntos).toHaveLength(3);
    pagina
      .mockResolvedValueOnce({ data: muchos(0, 1000), error: null, status: 200 })
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' }, status: 500 });
    expect(await sincronizar(null)).toEqual({ ok: false, codigo: 'SERVIDOR_NO_DISPONIBLE' });
    expect(estadoPuntos().puntos).toHaveLength(3);
  });
});

// docs/18 RV-44: jefatura nunca guarda config (lee la vista); sus puntos llegan ya derivados.
describe('sin config guardada no se re-deriva con la de por defecto (RV-44)', () => {
  it('sin config guardada (jefatura) cargarGuardados no cambia radio_px ni revision_caducada', async () => {
    const guardado = almacenEnMemoria<Punto>();
    // Valores de la vista con una escala y unos meses distintos de los de por defecto.
    await guardado.reemplazar(
      [p('1', { fecha_ultima_revision: '2020-01-01', radio_px: 17, revision_caducada: false })],
      [],
    );
    _usarAlmacen(guardado);
    await cargarGuardados();
    expect(estadoPuntos().puntos[0]).toMatchObject({ radio_px: 17, revision_caducada: false });
  });

  it('rederivarSiCambiaElDia sin config no hace nada', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(2026, 8, 22, 12));
      const guardado = almacenEnMemoria<Punto>();
      await guardado.reemplazar([p('1', { fecha_ultima_revision: '2020-01-01', radio_px: 17 })], []);
      _usarAlmacen(guardado);
      await cargarGuardados();
      vi.setSystemTime(new Date(2026, 8, 23, 9));
      rederivarSiCambiaElDia();
      expect(estadoPuntos().puntos[0]).toMatchObject({ radio_px: 17, revision_caducada: false });
    } finally {
      vi.useRealTimers();
    }
  });
});

// docs/18 RV-45: una sincronización en curso al cerrar sesión no vuelve a escribir (FL-12).
describe('cerrar sesión durante una sincronización (RV-45)', () => {
  it('cerrar sesión durante una sincronización no deja puntos', async () => {
    const almacen = almacenEnMemoria<Punto>();
    _usarAlmacen(almacen);
    let soltar!: (v: unknown) => void;
    rpc.mockReturnValueOnce(new Promise((r) => (soltar = r)));
    const sinc = sincronizar(TOKEN);
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    await borrarPuntos();
    soltar(
      ok({
        puntos: [p('1')],
        bajas: [],
        sincronizado_en: 'S1',
        config: { meses_revision: 12, escala_radios: [11, 9, 7, 5.5, 5] },
      }),
    );
    await sinc;
    expect(estadoPuntos().puntos).toEqual([]);
    expect(estadoPuntos().sincronizadoEn).toBeNull();
    expect(await almacen.todos()).toEqual([]);
    expect(await almacen.leerMeta('sincronizado_en')).toBeNull();
  });
});

// docs/18 GM-01: el tramo de manguera sale de la config recibida, con 20 por defecto.
describe('tramo de manguera (FR-142)', () => {
  it('20 sin config y el de la config recibida después', async () => {
    expect(metrosTramoManguera()).toBe(20);
    rpc.mockResolvedValueOnce(
      ok({
        puntos: [p('1')],
        bajas: [],
        sincronizado_en: 'S1',
        config: { meses_revision: 12, escala_radios: [11, 9, 7, 5.5, 5], metros_tramo_manguera: 25 },
      }),
    );
    await sincronizar(TOKEN);
    expect(metrosTramoManguera()).toBe(25);
    await borrarPuntos();
    expect(metrosTramoManguera()).toBe(20);
  });
});
