// Seguimiento de la posición (FR-65, docs/17 RV-09): un timeout del GPS no puede apagarlo para
// siempre; solo el permiso denegado lo para.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Exito = (p: GeolocationPosition) => void;
type Fallo = (e: GeolocationPositionError) => void;

let exito: Exito;
let fallo: Fallo;
// Como el navegador: tras clearWatch ya no llega nada.
let limpiada = false;
const watchPosition = vi.fn((ok: Exito, ko: Fallo, opciones?: PositionOptions) => {
  void opciones;
  limpiada = false;
  exito = (p) => !limpiada && ok(p);
  fallo = (e) => !limpiada && ko(e);
  return 7;
});
const clearWatch = vi.fn(() => {
  limpiada = true;
});

const CODIGOS = { PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as const;
const error = (code: number) => ({ code, message: '', ...CODIGOS }) as GeolocationPositionError;
const fix = (lat = 37.23, lng = -3.65, precision = 9) =>
  ({ coords: { latitude: lat, longitude: lng, accuracy: precision }, timestamp: Date.now() }) as GeolocationPosition;

let posicion: typeof import('./posicion');

beforeEach(async () => {
  vi.resetModules();
  watchPosition.mockClear();
  clearWatch.mockClear();
  vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch } });
  posicion = await import('./posicion');
});
afterEach(() => vi.unstubAllGlobals());

describe('seguimiento de la posición (RV-09)', () => {
  it('un TIMEOUT sin fix previo deja no_disponible y no llama a clearWatch', () => {
    posicion.activarPosicion();
    fallo(error(CODIGOS.TIMEOUT));
    expect(posicion.estadoPosicion().tipo).toBe('no_disponible');
    expect(clearWatch).not.toHaveBeenCalled();
  });

  it('un fix posterior al TIMEOUT pasa a ok', () => {
    posicion.activarPosicion();
    fallo(error(CODIGOS.TIMEOUT));
    exito(fix());
    expect(posicion.estadoPosicion()).toMatchObject({ tipo: 'ok', posicion: { lat: 37.23, precision: 9 } });
  });

  it('un TIMEOUT con fix previo mantiene ok con antigua=true', () => {
    posicion.activarPosicion();
    exito(fix(37.24, -3.66, 12));
    fallo(error(CODIGOS.TIMEOUT));
    expect(posicion.estadoPosicion()).toMatchObject({
      tipo: 'ok',
      posicion: { lat: 37.24, lng: -3.66, precision: 12, antigua: true },
    });
    exito(fix());
    expect(posicion.posicionActual()?.antigua).toBeFalsy();
  });

  it('POSITION_UNAVAILABLE tampoco para la vigilancia', () => {
    posicion.activarPosicion();
    fallo(error(CODIGOS.POSITION_UNAVAILABLE));
    expect(clearWatch).not.toHaveBeenCalled();
    posicion.activarPosicion();
    expect(watchPosition).toHaveBeenCalledTimes(1);
  });

  it('PERMISSION_DENIED para la vigilancia', () => {
    posicion.activarPosicion();
    fallo(error(CODIGOS.PERMISSION_DENIED));
    expect(posicion.estadoPosicion().tipo).toBe('denegada');
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it('espera hasta 60 s al primer fix y acepta posiciones de hasta 15 s', () => {
    posicion.activarPosicion();
    expect(watchPosition.mock.calls[0]![2]).toMatchObject({ timeout: 60_000, maximumAge: 15_000 });
  });
});
