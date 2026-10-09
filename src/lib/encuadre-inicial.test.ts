// docs/33 RV-310: dónde se abre el mapa.

import { describe, expect, it } from 'vitest';
import { ZOOM_CALLE, encuadreInicial } from './encuadre-inicial';

const AHORA = 1_800_000_000_000;
const ALBOLOTE = { lat: 37.2302, lng: -3.6575, precision: 10, momento: AHORA - 5_000 };
const PUNTOS = [
  { lat: 37.23, lng: -3.66 },
  { lat: 37.24, lng: -3.65 },
  { lat: 37.235, lng: -3.655 },
];

describe('encuadre al abrir el mapa (RV-310)', () => {
  it('con posición al día y dentro de la zona: zoom de calle sobre el voluntario', () => {
    expect(encuadreInicial(ALBOLOTE, PUNTOS, AHORA)).toEqual({
      tipo: 'posicion',
      lat: ALBOLOTE.lat,
      lng: ALBOLOTE.lng,
      zoom: ZOOM_CALLE,
    });
    expect(ZOOM_CALLE).toBe(17);
  });

  it('sin posición: el recuadro de todos los puntos', () => {
    expect(encuadreInicial(null, PUNTOS, AHORA)).toEqual({
      tipo: 'puntos',
      recuadro: [
        [37.23, -3.66],
        [37.24, -3.65],
      ],
    });
  });

  it('con una posición vieja (más de un minuto) o la última antes de perder el GPS: los puntos', () => {
    expect(encuadreInicial({ ...ALBOLOTE, momento: AHORA - 120_000 }, PUNTOS, AHORA).tipo).toBe('puntos');
    expect(encuadreInicial({ ...ALBOLOTE, antigua: true }, PUNTOS, AHORA).tipo).toBe('puntos');
  });

  it('fuera de la zona (Madrid): los puntos', () => {
    expect(encuadreInicial({ ...ALBOLOTE, lat: 40.4168, lng: -3.7038 }, PUNTOS, AHORA).tipo).toBe('puntos');
  });

  it('con un solo punto, un recuadro de lado cero (Mapa lo limita a zoom de calle)', () => {
    const e = encuadreInicial(null, [PUNTOS[0]!], AHORA);
    expect(e.tipo === 'puntos' && e.recuadro[0]).toEqual([37.23, -3.66]);
    expect(e.tipo === 'puntos' && e.recuadro[1]).toEqual([37.23, -3.66]);
  });

  it('sin posición ni puntos: nada que encuadrar (se queda la zona)', () => {
    expect(encuadreInicial(null, [], AHORA)).toEqual({ tipo: 'nada' });
  });
});
