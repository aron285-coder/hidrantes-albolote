// Mis propuestas (FR-90, FR-91, FR-27): qué avisa de novedades y qué se guarda en el móvil.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { almacenEnMemoria } from './pruebas';

const rpcCliente = vi.fn();
vi.mock('./supabase', () => ({ supabase: () => ({ rpc: rpcCliente }) }));

const {
  _reiniciarMisPropuestas,
  calcularNovedades,
  cargarMisPropuestas,
  cargarYMarcarVistas,
  marcarVistas,
  misPropuestas,
  novedadesPendientes,
  olvidarMisPropuestas,
  suscribirMisPropuestas,
} = await import('./mis-propuestas');
const { guardarSesion } = await import('./sesion');
const { _reiniciar } = await import('./conexion');

type Fila = Parameters<typeof calcularNovedades>[0][number];
const fila = (id: string, estado: Fila['estado']): Fila => ({
  id,
  clave_local: `l-${id}`,
  operacion: 'estado',
  punto_id: 'x1',
  codigo: 'HID-0147',
  datos: {},
  estado,
  motivo_rechazo: null,
  correcciones: null,
  creada_en: '2026-09-01T10:00:00Z',
  revisada_en: estado === 'pendiente' ? null : '2026-09-02T10:00:00Z',
});

let almacen: Map<string, string>;
beforeEach(() => {
  almacen = almacenEnMemoria();
  rpcCliente.mockReset();
  _reiniciar();
  _reiniciarMisPropuestas();
});
afterEach(() => vi.unstubAllGlobals());

describe('calcularNovedades (FR-90)', () => {
  it('la primera vez no avisa de lo antiguo', () => {
    expect(calcularNovedades([fila('a', 'aprobada'), fila('b', 'rechazada')], null)).toEqual([]);
  });

  it('avisa de lo resuelto desde la última mirada', () => {
    const vistas = { a: 'pendiente' as const };
    const novedades = calcularNovedades([fila('a', 'aprobada'), fila('b', 'pendiente')], vistas);
    expect(novedades.map((p) => p.id)).toEqual(['a']);
  });

  it('lo ya visto no vuelve a avisar, y lo pendiente nunca avisa', () => {
    const vistas = { a: 'aprobada' as const, b: 'pendiente' as const };
    expect(calcularNovedades([fila('a', 'aprobada'), fila('b', 'pendiente')], vistas)).toEqual([]);
  });

  it('retirar una propuesta propia no es una novedad que avisar', () => {
    expect(calcularNovedades([fila('a', 'retirada_por_autor')], { a: 'pendiente' })).toEqual([]);
  });
});

describe('cargarMisPropuestas (FR-91)', () => {
  it('sin sesión no se llama al servidor y la lista queda vacía', async () => {
    await expect(cargarMisPropuestas()).resolves.toEqual({ ok: true, datos: [] });
    expect(rpcCliente).not.toHaveBeenCalled();
  });

  it('guarda la última lista en el móvil para verla sin cobertura', async () => {
    guardarSesion('t-1', { nombre: 'Sara', apellido: 'Ruiz' });
    rpcCliente.mockResolvedValue({ data: [fila('a', 'aprobada')], error: null, status: 200 });
    await cargarMisPropuestas();
    expect(misPropuestas().map((p) => p.id)).toEqual(['a']);
    expect(almacen.get('hidrantes.mis_propuestas')).toContain('"a"');
  });

  it('una respuesta con forma rara no tumba la pantalla (TR-106)', async () => {
    guardarSesion('t-1', { nombre: 'Sara', apellido: 'Ruiz' });
    rpcCliente.mockResolvedValue({ data: { ups: true }, error: null, status: 200 });
    await expect(cargarMisPropuestas()).resolves.toEqual({ ok: true, datos: [] });
    expect(misPropuestas()).toEqual([]);
  });

  it('la primera carga marca lo visto; la siguiente ya avisa de lo resuelto', async () => {
    guardarSesion('t-1', { nombre: 'Sara', apellido: 'Ruiz' });
    rpcCliente.mockResolvedValue({ data: [fila('a', 'pendiente')], error: null, status: 200 });
    await cargarMisPropuestas();
    expect(novedadesPendientes()).toEqual([]);

    rpcCliente.mockResolvedValue({ data: [fila('a', 'aprobada')], error: null, status: 200 });
    await cargarMisPropuestas();
    expect(novedadesPendientes().map((p) => p.id)).toEqual(['a']);

    marcarVistas();
    expect(novedadesPendientes()).toEqual([]);
  });

  it('olvidarMisPropuestas vacía la lista y los avisos, y avisa a la pantalla (RV-153)', async () => {
    guardarSesion('t-1', { nombre: 'Sara', apellido: 'Ruiz' });
    rpcCliente.mockResolvedValue({ data: [fila('a', 'pendiente')], error: null, status: 200 });
    await cargarMisPropuestas();
    rpcCliente.mockResolvedValue({ data: [fila('a', 'rechazada')], error: null, status: 200 });
    await cargarMisPropuestas();
    expect(novedadesPendientes()).toHaveLength(1);
    const oyente = vi.fn();
    suscribirMisPropuestas(oyente);

    olvidarMisPropuestas();
    expect(misPropuestas()).toEqual([]);
    expect(novedadesPendientes()).toEqual([]);
    expect(oyente).toHaveBeenCalled();
  });

  it('una carga que vuelve después de cerrar sesión no repone la lista del anterior (RV-153)', async () => {
    guardarSesion('t-1', { nombre: 'Sara', apellido: 'Ruiz' });
    let responder: (v: unknown) => void = () => undefined;
    rpcCliente.mockReturnValue(new Promise((r) => (responder = r)));
    const carga = cargarMisPropuestas();
    olvidarMisPropuestas();
    responder({ data: [fila('a', 'rechazada')], error: null, status: 200 });
    const r = await carga;
    expect(r.ok).toBe(false);
    expect(misPropuestas()).toEqual([]);
    expect(almacen.has('hidrantes.mis_propuestas')).toBe(false);
  });

  it('con la carga fallida no se marca nada como visto (RV-153)', async () => {
    guardarSesion('t-1', { nombre: 'Sara', apellido: 'Ruiz' });
    rpcCliente.mockResolvedValue({ data: [fila('a', 'pendiente')], error: null, status: 200 });
    await cargarMisPropuestas();
    rpcCliente.mockResolvedValue({ data: [fila('a', 'aprobada')], error: null, status: 200 });
    await cargarMisPropuestas();
    expect(novedadesPendientes()).toHaveLength(1);
    const vistasAntes = almacen.get('hidrantes.propuestas_vistas');

    rpcCliente.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' }, status: 0 });
    await cargarYMarcarVistas();
    expect(novedadesPendientes()).toHaveLength(1);
    expect(almacen.get('hidrantes.propuestas_vistas')).toBe(vistasAntes);

    rpcCliente.mockResolvedValue({ data: [fila('a', 'aprobada')], error: null, status: 200 });
    await cargarYMarcarVistas();
    expect(novedadesPendientes()).toEqual([]);
  });

  it('nunca llega quién decidió: la fila no trae nombres ni correos (FR-27)', async () => {
    guardarSesion('t-1', { nombre: 'Sara', apellido: 'Ruiz' });
    rpcCliente.mockResolvedValue({ data: [fila('a', 'rechazada')], error: null, status: 200 });
    await cargarMisPropuestas();
    const guardado = almacen.get('hidrantes.mis_propuestas') ?? '';
    expect(guardado).not.toMatch(/@|revisor|admin/i);
  });
});
