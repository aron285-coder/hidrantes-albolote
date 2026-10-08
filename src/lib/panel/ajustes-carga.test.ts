// docs/32 RV-257 y RV-261: Ajustes no inventa datos cuando no han podido cargar.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const respuesta = vi.hoisted(() => ({ valor: { ok: true, datos: [] } as unknown }));
vi.mock('./consultas', () => ({
  leerLista: async () => respuesta.valor,
  leer: async () => respuesta.valor,
  funcion: async () => respuesta.valor,
}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  rpc: (...a: unknown[]) => rpc(...a),
}));

const {
  PARAMETROS_POR_DEFECTO,
  avisoEspacioFotos,
  avisoPedido,
  cambiosParametros,
  cargarPedidos,
  contarDispositivos,
  estadoPedido,
  revocarDispositivo,
  textoBaseDeDatos,
  textoEspacioFotos,
} = await import('./ajustes');
const { textoError } = await import('./errores');
const { T } = await import('../textos');
type Salud = import('./ajustes').Salud;
type PedidoReciente = import('./ajustes').PedidoReciente;

beforeEach(() => {
  respuesta.valor = { ok: true, datos: [] };
  rpc.mockReset();
});

const MB = 1024 ** 2;
const SALUD = { storage_bytes: null, bd_bytes: 38 * MB } as unknown as Salud;

describe('Salud: espacio de fotos y de la base de datos (docs/32 RV-262)', () => {
  const con0041: Salud = {
    ...SALUD,
    fotos_bytes: 200 * MB,
    fotos_origen: 'storage',
    max_bytes_fotos: 800 * MB,
    fotos_pct: 26.9,
    max_bytes_bd: 400 * MB,
    bd_pct: 9.5,
  };

  it('fotos en MB y % del tope; la base de datos, igual', () => {
    expect(textoEspacioFotos(con0041, 'produccion')).toBe(T.panelAjustes.espacioDetalle('200,0', '26,9', '800,0'));
    expect(textoBaseDeDatos(con0041)).toBe(T.panelAjustes.espacioDetalle('38,0', '9,5', '400,0'));
  });

  it('sin el dato de 0041 (o sin medir), como antes', () => {
    expect(textoEspacioFotos(SALUD, 'staging')).toBe(T.panelAjustes.almacenamientoNoAplica);
    expect(textoEspacioFotos({ ...con0041, fotos_origen: 'sin_dato' }, 'produccion')).toBe(T.panelAjustes.sinDato);
    expect(textoBaseDeDatos(SALUD)).toBe(T.panelAjustes.baseDeDatosDetalle('38,0', '500,0'));
  });

  it('avisa desde el 70 % del tope de fotos, con el texto del tope', () => {
    expect(avisoEspacioFotos({ ...con0041, fotos_pct: 69.9 })).toBeNull();
    expect(avisoEspacioFotos({ ...con0041, fotos_pct: 72.4 })).toEqual({ pct: 72, delTope: true });
    // Sin 0041, el del gigabyte gratuito desde el 90 %.
    expect(avisoEspacioFotos({ ...SALUD, storage_bytes: 0.95 * 1024 ** 3 })).toEqual({ pct: 95, delTope: false });
  });
});

describe('Mantenimiento: últimos pedidos (docs/32 RV-260)', () => {
  const pedido = (p: Partial<PedidoReciente>): PedidoReciente => ({
    id: 1,
    workflow: 'regenerar-zona',
    pedido_en: '2026-10-08T08:00:00Z',
    lanzado_en: null,
    estado: 'pedido',
    resultado: null,
    ...p,
  });

  it('pide los 5 últimos a fn_pedidos_recientes', async () => {
    rpc.mockResolvedValue({ ok: true, datos: [pedido({})] });
    await expect(cargarPedidos()).resolves.toEqual({ ok: true, datos: [pedido({})] });
    expect(rpc).toHaveBeenCalledWith('fn_pedidos_recientes', { limite: 5 });
  });

  it('si no carga, el error (no una lista vacía)', async () => {
    rpc.mockResolvedValue({ ok: false, codigo: 'SIN_SERVIDOR' });
    await expect(cargarPedidos()).resolves.toEqual({ ok: false, codigo: 'SIN_SERVIDOR' });
  });

  it('el estado en palabras: pedido, lanzado y el error con su texto', () => {
    expect(estadoPedido(pedido({}))).toBe(T.panelAjustes.pedidoPendiente);
    expect(estadoPedido(pedido({ estado: 'lanzado', resultado: 'lanzado' }))).toBe(T.panelAjustes.pedidoLanzado);
    expect(estadoPedido(pedido({ estado: 'error', resultado: 'error: caducado' }))).toBe(
      T.panelAjustes.pedidoError('caducado'),
    );
    expect(estadoPedido(pedido({ estado: 'error', resultado: 'error: ' }))).toBe(T.panelAjustes.pedidoErrorSinMotivo);
  });
});

describe('Revocar un móvil desde Salud (docs/32 RV-262)', () => {
  it('llama a fn_revocar_dispositivo con los 8 caracteres', async () => {
    rpc.mockResolvedValue({ ok: true, datos: 1 });
    await revocarDispositivo('abcd1234');
    expect(rpc).toHaveBeenCalledWith('fn_revocar_dispositivo', { dispositivo: 'abcd1234' });
  });

  it('sus errores, en palabras de jefatura', () => {
    expect(textoError('DISPOSITIVO_NO_ENCONTRADO')).toBe(T.panelErrores.dispositivoNoEncontrado);
    expect(textoError('PAYLOAD_INVALIDO(dispositivo)')).toBe(T.panelErrores.dispositivoAmbiguo);
    expect(textoError('PAYLOAD_INVALIDO(otro)')).toBe(T.panelErrores.datos);
  });
});

describe('contarDispositivos (docs/32 RV-261)', () => {
  it('cuenta los móviles con acceso', async () => {
    respuesta.valor = { ok: true, datos: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
    expect(await contarDispositivos()).toEqual({ ok: true, datos: 3 });
  });

  it('si no puede leerlos, devuelve el error y no un 0', async () => {
    respuesta.valor = { ok: false, codigo: 'SIN_SERVIDOR' };
    expect(await contarDispositivos()).toEqual({ ok: false, codigo: 'SIN_SERVIDOR' });
  });
});

describe('aviso al pedir mantenimiento (docs/32 RV-260)', () => {
  it('en staging dice que queda anotado; si no, que empezará en unos minutos', () => {
    expect(avisoPedido('Regenerar zona', { pedido: true, staging: true })).toBe(
      T.panelAjustes.trabajoAnotadoStaging('Regenerar zona'),
    );
    expect(avisoPedido('Regenerar zona', { pedido: true })).toBe(T.panelAjustes.trabajoPedido('Regenerar zona'));
    expect(avisoPedido('Regenerar zona', null)).toBe(T.panelAjustes.trabajoPedido('Regenerar zona'));
  });
});

describe('cambiosParametros sin cargar (docs/32 RV-257)', () => {
  it('sin lo guardado de verdad no hay cambios que mandar, tampoco los valores por defecto', () => {
    const editado = { ...PARAMETROS_POR_DEFECTO, meses_revision: 18 };
    expect(cambiosParametros(null, editado)).toEqual({});
    expect(cambiosParametros(null, PARAMETROS_POR_DEFECTO)).toEqual({});
  });

  it('con lo cargado, compara con eso y no con los valores por defecto', () => {
    const cargado = { ...PARAMETROS_POR_DEFECTO, meses_revision: 6, dias_papelera: 45 };
    expect(cambiosParametros(cargado, { ...cargado, meses_revision: 18 })).toEqual({ meses_revision: 18 });
  });
});
