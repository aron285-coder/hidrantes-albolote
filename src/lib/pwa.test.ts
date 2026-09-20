// Aviso de versión nueva (TR-24). El Service Worker de verdad se prueba en un móvil; aquí se
// comprueba el cableado: que el aviso aparece cuando llega una versión, que nadie se entera antes,
// y que recargar usa el actualizador del Service Worker (y no un location.reload a ciegas).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let alHaberVersion: (() => void) | undefined;
let alRegistrar: ((url: string, registro: unknown) => void) | undefined;
const actualizar = vi.fn(async () => undefined);

vi.mock('virtual:pwa-register', () => ({
  registerSW: (opciones: { onNeedRefresh?: () => void; onRegisteredSW?: (u: string, r: unknown) => void }) => {
    alHaberVersion = opciones.onNeedRefresh;
    alRegistrar = opciones.onRegisteredSW;
    return actualizar;
  },
}));

const { recargar, registrarServiceWorker, suscribirVersion, versionNueva } = await import('./pwa');

beforeEach(() => {
  actualizar.mockClear();
  vi.stubGlobal('navigator', { serviceWorker: {} });
});
afterEach(() => vi.unstubAllGlobals());

describe('versión nueva (TR-24)', () => {
  it('no se avisa de nada hasta que hay una versión nueva', () => {
    registrarServiceWorker();
    expect(versionNueva()).toBe(false);
  });

  it('cuando el Service Worker la encuentra, se avisa a quien escuche', () => {
    registrarServiceWorker();
    const oyente = vi.fn();
    const dejar = suscribirVersion(oyente);
    alHaberVersion!();
    expect(versionNueva()).toBe(true);
    expect(oyente).toHaveBeenCalledOnce();
    dejar();
    alHaberVersion!();
    expect(oyente).toHaveBeenCalledOnce();
  });

  it('recargar usa el actualizador del Service Worker', () => {
    registrarServiceWorker();
    recargar();
    expect(actualizar).toHaveBeenCalledWith(true);
  });

  it('con la app abierta se sigue mirando si hay versión nueva (cada hora)', () => {
    vi.useFakeTimers();
    const registro = { update: vi.fn(async () => undefined) };
    registrarServiceWorker();
    alRegistrar!('/sw.js', registro);
    vi.advanceTimersByTime(3 * 3600_000);
    expect(registro.update).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('en un navegador sin Service Worker no se registra nada ni se rompe', () => {
    vi.stubGlobal('navigator', {});
    expect(() => registrarServiceWorker()).not.toThrow();
  });
});
