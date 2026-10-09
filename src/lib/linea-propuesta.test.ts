// docs/33 RV-315 (U6): la línea de Mis propuestas para las seis operaciones.

import { describe, expect, it } from 'vitest';
import { lineaPropuesta } from './linea-propuesta';

describe('lineaPropuesta (docs/33 RV-315)', () => {
  it('alta: tipo y medida', () => {
    expect(lineaPropuesta('alta', { tipo: 'hidrante', diametro_mm: 100, caudal: 'bueno' })).toBe('Hidrante 100 mm');
    expect(lineaPropuesta('alta', { tipo: 'boca_riego', diametro_otro: 32, caudal: 'bueno', racor: 'granada' })).toBe(
      'Boca de riego 32 mm',
    );
    // Sin medida (la app anterior no la mandaba en una boca): solo el tipo.
    expect(lineaPropuesta('alta', { tipo: 'boca_riego', caudal: 'bueno' })).toBe('Boca de riego');
    expect(lineaPropuesta('alta', {})).toBe('Punto nuevo');
  });

  it('revisión: «Sigue igual»', () => {
    expect(lineaPropuesta('revision', {})).toBe('Sigue igual');
    expect(lineaPropuesta('revision', { nota: 'Tapa nueva' })).toBe('Sigue igual');
  });

  it('estado: de qué a qué, si se sabe lo de antes', () => {
    expect(
      lineaPropuesta('estado', { caudal: 'no_funciona', descripcion_fallo: 'Tapa soldada' }, { caudal: 'regular' }),
    ).toBe('Regular → No funciona');
    expect(lineaPropuesta('estado', { caudal: 'barro' })).toBe('Barro');
    // Lo de antes igual que lo nuevo (el punto ya está al día): sin flecha.
    expect(lineaPropuesta('estado', { caudal: 'malo' }, { caudal: 'malo' })).toBe('Malo');
  });

  it('corregir datos: cada campo con su nombre', () => {
    expect(lineaPropuesta('datos', { racor: 'directo' }, { racor: 'granada' })).toBe(
      'Tipo de enganche: Granada → Directo',
    );
    expect(lineaPropuesta('datos', { diametro_mm: 70, racor: 'barcelona' })).toBe(
      'Diámetro: 70 mm · Tipo de enganche: Barcelona',
    );
    // La otra medida de una boca se lee como su diámetro.
    expect(lineaPropuesta('datos', { diametro_otro: 32 }, { diametro_mm: 45 })).toBe('Diámetro: 45 mm → 32 mm');
    // El tipo viaja igual al de antes (04 §12): no es un cambio.
    expect(lineaPropuesta('datos', { tipo: 'hidrante', diametro_mm: 100 })).toBe('Diámetro: 100 mm');
    expect(lineaPropuesta('datos', {})).toBe('Corregir datos');
  });

  it('corregir ubicación', () => {
    expect(lineaPropuesta('ubicacion', { nota: 'Estaba en la otra acera' })).toBe('Posición nueva en el mapa');
  });

  it('retirada: el motivo', () => {
    expect(lineaPropuesta('retirada', { motivo_rapido: 'obras', motivo: '' })).toBe('Retirada: Obras');
    expect(lineaPropuesta('retirada', { motivo_rapido: 'otro', motivo: 'Lo quitó el ayuntamiento' })).toBe(
      'Retirada: Lo quitó el ayuntamiento',
    );
    expect(lineaPropuesta('retirada', {})).toBe('Retirada');
  });

  it('unos datos raros no rompen la línea', () => {
    expect(lineaPropuesta('estado', null)).toBe('Estado');
    expect(lineaPropuesta('datos', ['x'])).toBe('Corregir datos');
  });
});
