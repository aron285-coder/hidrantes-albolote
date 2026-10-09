// docs/32 RV-242: cada error al entrar con el código tiene su texto.

import { describe, expect, it } from 'vitest';
import { SIN_SERVIDOR } from './api';
import { mensajeEntrada } from './mensajes-entrada';
import { T } from './textos';

describe('mensajeEntrada (RV-242)', () => {
  it('los de siempre', () => {
    expect(mensajeEntrada('CODIGO_INCORRECTO')).toBe(T.entrada.codigoIncorrecto);
    expect(mensajeEntrada('PAYLOAD_INVALIDO')).toBe(T.entrada.codigoSeisCifras);
    expect(mensajeEntrada(SIN_SERVIDOR)).toBe(T.entrada.sinServidor);
  });

  it('demasiados intentos, con la hora a la que se puede volver a probar', () => {
    // 15:05 UTC del 8 oct 2026 = 17:05 en Madrid (horario de verano).
    expect(mensajeEntrada('DEMASIADOS_INTENTOS', Date.UTC(2026, 9, 8, 15, 5))).toBe(
      T.entrada.demasiadosIntentosHasta('17:05'),
    );
    expect(mensajeEntrada('DEMASIADOS_INTENTOS')).toBe(T.entrada.demasiadosIntentos);
  });

  it('dispositivo reservado, topes y acceso caducado, cada uno con su texto', () => {
    expect(mensajeEntrada('DISPOSITIVO_RESERVADO')).toBe(T.entrada.dispositivoReservado);
    expect(mensajeEntrada('CUOTA_CANJES_AGOTADA')).toBe(T.entrada.cuota);
    expect(mensajeEntrada('TOKEN_REVOCADO')).toBe(T.entrada.tokenNoVale);
  });

  it('uno desconocido dice su código, no "sin conexión"', () => {
    expect(mensajeEntrada('ALGO_NUEVO')).toBe(T.entrada.errorDesconocido('ALGO_NUEVO'));
    expect(mensajeEntrada('ALGO_NUEVO')).not.toBe(T.entrada.sinServidor);
    // Nunca un texto del servidor tal cual: solo el código.
    expect(mensajeEntrada('<b>raro</b> x')).toBe(T.entrada.errorDesconocido('?'));
  });
});
