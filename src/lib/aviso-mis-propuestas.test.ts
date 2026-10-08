// docs/32 RV-241: Mis propuestas dice cuándo no ha podido cargar.

import { describe, expect, it } from 'vitest';
import { avisoMisPropuestas } from './aviso-mis-propuestas';

describe('avisoMisPropuestas (RV-241)', () => {
  it('sin lista y con la carga fallida: no ha podido cargar, no "todavía no has propuesto nada"', () => {
    expect(avisoMisPropuestas('fallo', false, 'bien')).toBe('no_cargada');
    expect(avisoMisPropuestas('fallo', false, 'sin_servidor')).toBe('no_cargada');
    expect(avisoMisPropuestas('fallo', false, 'sin_cobertura')).toBe('no_cargada');
  });

  it('sin lista: cargando y vacía de verdad', () => {
    expect(avisoMisPropuestas('cargando', false, 'bien')).toBe('cargando');
    expect(avisoMisPropuestas('bien', false, 'bien')).toBe('vacia');
  });

  it('con lista guardada y un error del servidor: no se ha podido actualizar', () => {
    expect(avisoMisPropuestas('fallo', true, 'bien')).toBe('no_actualizada');
    expect(avisoMisPropuestas('fallo', true, 'sin_servidor')).toBe('no_actualizada');
  });

  it('con lista guardada y sin cobertura: la lista guardada de siempre', () => {
    expect(avisoMisPropuestas('fallo', true, 'sin_cobertura')).toBe('sin_conexion');
    expect(avisoMisPropuestas('cargando', true, 'sin_cobertura')).toBe('sin_conexion');
  });

  it('al día, nada', () => {
    expect(avisoMisPropuestas('bien', true, 'bien')).toBeNull();
    expect(avisoMisPropuestas('cargando', true, 'bien')).toBeNull();
  });
});
