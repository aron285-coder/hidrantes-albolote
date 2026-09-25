// docs/21 RV-82: las medidas de los controles del mapa salen de un solo sitio (DEC-123, 06 §5).

import { describe, expect, it } from 'vitest';
import { ANCHO_FICHA, CONTROLES, MARGEN_FICHA_PX, RESERVA_DERECHA, ZONA_ABAJO } from './disposicion-mapa';

describe('disposición de los controles del mapa (RV-82)', () => {
  it('la columna son iconos de 44 px a 8 px del borde, y lo que flota a su lado deja 8 px más', () => {
    expect(CONTROLES.ancho).toBe(44);
    expect(RESERVA_DERECHA).toBe(8 + 44 + 8);
  });

  it('abajo caben el + de 56 px y Cercanos de 48 px con 12 px entre ellos', () => {
    expect(ZONA_ABAJO).toBe(32 + 56 + 12 + 48 + 8);
  });

  it('el encuadre del incidente descuenta la ficha y la columna', () => {
    expect(MARGEN_FICHA_PX).toBe(ANCHO_FICHA + RESERVA_DERECHA + CONTROLES.aire);
  });
});
