// Geometría de la zona de cobertura en el móvil (FR-53, FR-55). El aviso de "fuera de zona" sale de
// aquí, así que se comprueba contra los datos reales de datos/, no contra un polígono inventado.

import { describe, expect, it } from 'vitest';
import limiteTexto from '../../datos/limite-municipal.geojson?raw';
import { dentroDeZona } from './zona';

const LIMITE = JSON.parse(limiteTexto) as GeoJSON.FeatureCollection<GeoJSON.MultiPolygon>;

describe('dentroDeZona (FR-55)', () => {
  it('los dos cascos urbanos y el polígono de Juncaril están dentro', () => {
    expect(dentroDeZona(37.2286, -3.6606)).toBe(true); // Albolote
    expect(dentroDeZona(37.2811, -3.6167)).toBe(true); // Calicasas
    expect(dentroDeZona(37.2445, -3.648)).toBe(true); // polígono de Juncaril
    expect(dentroDeZona(37.2604, -3.6925)).toBe(true); // Sierra Elvira, término de Albolote
  });

  it('los municipios vecinos y el resto del mundo, fuera', () => {
    expect(dentroDeZona(37.2225, -3.6317)).toBe(false); // Peligros
    expect(dentroDeZona(37.2214, -3.69)).toBe(false); // Atarfe
    expect(dentroDeZona(37.1773, -3.5986)).toBe(false); // Granada capital
    expect(dentroDeZona(40.4168, -3.7038)).toBe(false); // Madrid
  });

  it('el margen de 400 m: el término entero cae dentro, borde incluido (FR-53)', () => {
    const vertices = LIMITE.features.flatMap((f) => f.geometry.coordinates.flat(2));
    expect(vertices.length).toBeGreaterThan(100);
    const fuera = vertices.filter(([lng, lat]) => !dentroDeZona(lat, lng));
    expect(fuera).toEqual([]);
  });

  it('una coordenada imposible no rompe nada: simplemente está fuera', () => {
    expect(dentroDeZona(Number.NaN, -3.66)).toBe(false);
    expect(dentroDeZona(0, 0)).toBe(false);
  });
});
