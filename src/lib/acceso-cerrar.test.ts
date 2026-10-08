// Cerrar sesión, rápido y una sola vez (docs/32 RV-234). Antes, con los avisos activos, se esperaba a
// desactivarPush (hasta 10 s del Service Worker y 30 s de la RPC) antes de revocar el token, se
// llamaba a fn_borrar_suscripcion_push aunque fn_cerrar_sesion ya la borra, y un segundo toque lo
// repetía todo.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { almacenEnMemoria } from './pruebas';

const rpc = vi.fn();
vi.mock('./supabase', () => ({
  supabase: () => ({ rpc, auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => ({}) } }),
}));

const push = vi.hoisted(() => ({
  estado: 'activo' as string,
  desactivar: vi.fn<(o?: { borrarEnServidor?: boolean }) => Promise<string>>(async () => 'inactivo'),
}));
vi.mock('./push', () => ({
  estadoPush: () => push.estado,
  desactivarPush: (o?: { borrarEnServidor?: boolean }) => push.desactivar(o),
  pedirEnvioPush: vi.fn(),
  resincronizarPush: vi.fn(async () => undefined),
}));

const { _reiniciarAcceso, acceso, cerrarSesionVoluntario, LIMITE_CERRAR_SESION_MS } = await import('./acceso');
const { guardarSesion, leerSesion } = await import('./sesion');
const { _reiniciar } = await import('./conexion');

const TOKEN = 'a'.repeat(43);
const llamadas = (nombre: string) => rpc.mock.calls.filter((c) => c[0] === nombre);

beforeEach(() => {
  almacenEnMemoria();
  vi.stubGlobal('location', { search: '', pathname: '/' });
  _reiniciar();
  guardarSesion(TOKEN, { nombre: 'Ana', apellido: 'Ruiz' });
  _reiniciarAcceso();
  rpc.mockReset().mockResolvedValue({ data: null, error: null, status: 204 });
  push.estado = 'activo';
  push.desactivar.mockReset().mockResolvedValue('inactivo');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  _reiniciar();
});

describe('cerrar sesión, rápido y una sola vez (RV-234)', () => {
  it('no llama a fn_borrar_suscripcion_push: la borra fn_cerrar_sesion', async () => {
    await cerrarSesionVoluntario();
    expect(llamadas('fn_borrar_suscripcion_push')).toEqual([]);
    expect(llamadas('fn_cerrar_sesion')).toEqual([['fn_cerrar_sesion', { token: TOKEN }]]);
    // La del navegador se mira igual (solo se da de baja si jefatura no tiene avisos: RV-258).
    expect(push.desactivar).toHaveBeenCalledWith({ borrarEnServidor: false });
    expect(acceso().tipo).toBe('fuera');
  });

  it('sin avisos activos no se toca la suscripción del navegador', async () => {
    push.estado = 'inactivo';
    await cerrarSesionVoluntario();
    expect(push.desactivar).not.toHaveBeenCalled();
  });

  it('con el Service Worker y el servidor colgados, se cierra en 6 s', async () => {
    vi.useFakeTimers();
    push.desactivar.mockReturnValue(new Promise(() => undefined));
    rpc.mockReturnValue(new Promise(() => undefined));
    let cerrada = false;
    void cerrarSesionVoluntario().then(() => (cerrada = true));
    await vi.advanceTimersByTimeAsync(LIMITE_CERRAR_SESION_MS - 1);
    expect(cerrada).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(cerrada).toBe(true);
    expect(acceso().tipo).toBe('fuera');
    expect(leerSesion()).toBeNull();
  });

  it('el token se revoca a la vez que se apagan los avisos, no después', async () => {
    let soltar!: () => void;
    push.desactivar.mockReturnValue(new Promise((r) => (soltar = () => r('inactivo'))));
    const cierre = cerrarSesionVoluntario();
    await vi.waitFor(() => expect(llamadas('fn_cerrar_sesion')).toHaveLength(1));
    soltar();
    await cierre;
  });

  it('un segundo toque mientras se cierra no repite nada', async () => {
    let soltar!: () => void;
    rpc.mockReturnValue(new Promise((r) => (soltar = () => r({ data: null, error: null, status: 204 }))));
    const primero = cerrarSesionVoluntario();
    const segundo = cerrarSesionVoluntario();
    expect(segundo).toBe(primero);
    soltar();
    await primero;
    expect(llamadas('fn_cerrar_sesion')).toHaveLength(1);
    expect(push.desactivar).toHaveBeenCalledOnce();
  });
});
