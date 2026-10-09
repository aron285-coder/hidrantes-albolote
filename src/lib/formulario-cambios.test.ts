// docs/32 RV-239: cuándo un formulario de proponer está a medias.

import { describe, expect, it } from 'vitest';
import { hayCambios } from './formulario-cambios';

describe('hayCambios (RV-239)', () => {
  const inicial = { operacion: 'estado', pin: undefined, pinMovido: false, tipo: undefined };

  it('recién abierto, no hay nada que perder', () => {
    expect(hayCambios({ ...inicial }, inicial)).toBe(false);
  });

  it('elegir un estado, escribir o mover el pin es un cambio', () => {
    expect(hayCambios({ ...inicial, caudal: 'bueno' }, inicial)).toBe(true);
    expect(hayCambios({ ...inicial, nota: 'tapa rota' }, inicial)).toBe(true);
    expect(hayCambios({ ...inicial, pin: { lat: 37.2, lng: -3.6 }, pinMovido: true }, inicial)).toBe(true);
  });

  it('escribir y borrar no cuenta', () => {
    expect(hayCambios({ ...inicial, nota: '' }, inicial)).toBe(false);
  });

  it('el mismo pin, otro objeto: no es un cambio', () => {
    const conPin = { ...inicial, pin: { lat: 37.2, lng: -3.6 } };
    expect(hayCambios({ ...conPin, pin: { lat: 37.2, lng: -3.6 } }, conPin)).toBe(false);
  });
});
