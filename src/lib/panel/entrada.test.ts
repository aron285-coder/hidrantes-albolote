// docs/33 RV-338: la entrada del día del lanzamiento en Ajustes.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const respuesta = vi.hoisted(() => ({ valor: { ok: true, datos: [] } as unknown }));
vi.mock('./consultas', () => ({ leerLista: async () => respuesta.valor }));
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  rpc: (...a: unknown[]) => rpc(...a),
}));

const { abiertaHasta, abrirEntrada, cargarEntrada, cerrarEntrada, diaYHora } = await import('./entrada');
const { T } = await import('../textos');

const ahora = new Date('2026-10-09T16:30:00Z');

beforeEach(() => {
  respuesta.valor = { ok: true, datos: [] };
  rpc.mockReset();
});

describe('la entrada del día del lanzamiento (docs/33 RV-338)', () => {
  it('abierta solo con una hora válida en el futuro', () => {
    expect(abiertaHasta('2026-10-10T16:30:00Z', ahora)).toBe('2026-10-10T16:30:00Z');
    expect(abiertaHasta('2026-10-09T16:00:00Z', ahora)).toBeNull();
    expect(abiertaHasta(null, ahora)).toBeNull();
    expect(abiertaHasta('no es una fecha', ahora)).toBeNull();
    expect(abiertaHasta(1234, ahora)).toBeNull();
  });

  it('sin la fila de config (base sin 0044): no disponible, y nada se enseña', async () => {
    respuesta.valor = { ok: true, datos: [] };
    expect(await cargarEntrada(() => ahora)).toEqual({ ok: true, datos: { disponible: false, hasta: null } });
  });

  it('con la fila: cerrada (null o pasada) o abierta hasta su hora', async () => {
    respuesta.valor = { ok: true, datos: [{ clave: 'entrada_abierta_hasta', valor: null }] };
    expect(await cargarEntrada(() => ahora)).toEqual({ ok: true, datos: { disponible: true, hasta: null } });
    respuesta.valor = { ok: true, datos: [{ clave: 'entrada_abierta_hasta', valor: '2026-10-10T16:30:00Z' }] };
    expect(await cargarEntrada(() => ahora)).toEqual({
      ok: true,
      datos: { disponible: true, hasta: '2026-10-10T16:30:00Z' },
    });
  });

  it('si no se puede leer, el error (nunca "cerrada")', async () => {
    respuesta.valor = { ok: false, codigo: 'SIN_SERVIDOR' };
    expect(await cargarEntrada(() => ahora)).toEqual({ ok: false, codigo: 'SIN_SERVIDOR' });
  });

  it('abrir pide 24 h; cerrar, sin argumentos', async () => {
    rpc.mockResolvedValue({ ok: true, datos: '2026-10-10T16:30:00Z' });
    await abrirEntrada();
    expect(rpc).toHaveBeenCalledWith('fn_abrir_entrada', { horas: 24 });
    await cerrarEntrada();
    expect(rpc).toHaveBeenLastCalledWith('fn_cerrar_entrada');
  });

  it('"jue 10 a las 18:30", en hora de Albolote', () => {
    const { dia, hora } = diaYHora('2026-10-08T16:30:00Z');
    expect(T.panelAjustes.entradaAbiertaHasta(dia, hora)).toBe('Entrada abierta para todos hasta el jue 8 a las 18:30');
    expect(diaYHora('2026-10-10T22:30:00Z')).toEqual({ dia: 'dom 11', hora: '00:30' });
  });
});
