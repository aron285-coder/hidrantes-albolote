// docs/33 RV-311 (U2): las situaciones de la píldora de la cabecera.

import { describe, expect, it } from 'vitest';
import { AL_DIA_MS, estadoAnunciado, pildora } from './estado-sincro';
import { T } from './textos';

const AHORA = Date.parse('2026-10-09T12:00:00Z');
const hace = (ms: number) => AHORA - ms;

describe('píldora de la sincronización (RV-311)', () => {
  it('al día: punto verde «al día · 15»', () => {
    expect(pildora('bien', hace(5 * 60_000), false, 15, AHORA)).toEqual({
      tipo: 'normal',
      texto: T.mapa.alDia(15),
      punto: 'verde',
    });
    expect(T.mapa.alDia(15)).toBe('al día · 15');
  });

  it('con más de una hora: ámbar «hace 2 h»', () => {
    expect(pildora('bien', hace(2 * AL_DIA_MS + 60_000), false, 15, AHORA)).toEqual({
      tipo: 'normal',
      texto: 'hace 2 h',
      punto: 'ambar',
    });
  });

  it('sin cobertura: gris «sin conexión», aunque los datos sean de hace un momento', () => {
    expect(pildora('sin_cobertura', hace(60_000), false, 15, AHORA)).toEqual({
      tipo: 'normal',
      texto: T.mapa.sinConexion,
      punto: 'gris',
    });
  });

  it('sin servidor: la píldora con «Reintentar»', () => {
    expect(pildora('sin_servidor', hace(60_000), false, 15, AHORA)).toEqual({
      tipo: 'sin_servidor',
      texto: T.mapa.sinServidor,
    });
  });

  it('sin sincronizar aún, o sincronizando por primera vez', () => {
    expect(pildora('bien', null, false, 0, AHORA).texto).toBe(T.ajustes.sinSincronizar);
    expect(pildora('bien', null, true, 0, AHORA).texto).toBe(T.mapa.sincronizando);
  });

  it('el lector de pantalla oye el estado, sin el «hace N» que cambia cada minuto (RV-157)', () => {
    expect(estadoAnunciado('bien', hace(60_000), false)).toBe(T.mapa.sincronizadoSolo);
    expect(estadoAnunciado('sin_cobertura', hace(60_000), false)).toBe(T.mapa.sinCoberturaSolo);
    expect(estadoAnunciado('sin_servidor', hace(60_000), false)).toBe(T.mapa.sinServidor);
    expect(estadoAnunciado('bien', null, true)).toBe(T.mapa.sincronizando);
  });
});
