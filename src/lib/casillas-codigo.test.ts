// docs/36 RV-470: el código que entra de golpe en una casilla se reparte entero; una cifra y borrar,
// como siempre.

import { describe, expect, it } from 'vitest';
import { escribirEnCasilla } from './casillas-codigo';

const vacias = () => Array(6).fill('') as string[];

describe('casillas del código (RV-470)', () => {
  it('una cifra entra en su casilla y el foco pasa a la siguiente', () => {
    expect(escribirEnCasilla(vacias(), 0, '4')).toEqual({ cifras: ['4', '', '', '', '', ''], foco: 1 });
  });

  it('una cifra tecleada encima de otra la sustituye', () => {
    const cifras = ['4', '', '', '', '', ''];
    expect(escribirEnCasilla(cifras, 0, '48')?.cifras[0]).toBe('8');
    expect(escribirEnCasilla(cifras, 0, '84')?.cifras[0]).toBe('8');
    expect(escribirEnCasilla(cifras, 0, '44')?.cifras).toEqual(cifras);
  });

  it('en la última casilla, una cifra no saca el foco', () => {
    const cifras = ['4', '8', '2', '9', '1', ''];
    expect(escribirEnCasilla(cifras, 5, '5')).toEqual({ cifras: ['4', '8', '2', '9', '1', '5'], foco: 5 });
  });

  it('borrar vacía la casilla y deja el foco donde está', () => {
    expect(escribirEnCasilla(['4', '8', '', '', '', ''], 1, '')).toEqual({
      cifras: ['4', '', '', '', '', ''],
      foco: null,
    });
  });

  it('una letra no cambia nada', () => {
    expect(escribirEnCasilla(vacias(), 0, 'a')).toBeNull();
  });

  it('seis cifras en la primera casilla llenan las seis y el foco sale del código', () => {
    expect(escribirEnCasilla(vacias(), 0, '482915')).toEqual({
      cifras: ['4', '8', '2', '9', '1', '5'],
      foco: 'completo',
    });
  });

  it('el código insertado detrás de la cifra que ya había no la cuenta dos veces', () => {
    expect(escribirEnCasilla(['4', '', '', '', '', ''], 0, '4482915')?.cifras).toEqual(['4', '8', '2', '9', '1', '5']);
  });

  it('el código sugerido que sustituye a la cifra que había entra tal cual', () => {
    expect(escribirEnCasilla(['4', '', '', '', '', ''], 0, '482915')?.cifras).toEqual(['4', '8', '2', '9', '1', '5']);
  });

  it('desde la tercera casilla se reparte hasta la sexta', () => {
    expect(escribirEnCasilla(['1', '2', '', '', '', ''], 2, '482915')).toEqual({
      cifras: ['1', '2', '4', '8', '2', '9'],
      foco: 'completo',
    });
  });

  it('varias cifras que no completan el código dejan el foco en la siguiente vacía', () => {
    expect(escribirEnCasilla(vacias(), 0, '482')).toEqual({ cifras: ['4', '8', '2', '', '', ''], foco: 3 });
  });

  it('con espacios o guiones, solo cuentan las cifras', () => {
    expect(escribirEnCasilla(vacias(), 0, '482 915')?.cifras).toEqual(['4', '8', '2', '9', '1', '5']);
  });
});
