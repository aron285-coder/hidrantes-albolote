// docs/36 RV-470: el código que entra de golpe en una casilla se reparte entero; una cifra y borrar,
// como siempre.

import { describe, expect, it } from 'vitest';
import { escribirEnCasilla, repartir } from './casillas-codigo';

const vacias = () => Array(6).fill('') as string[];
const CODIGO = ['4', '8', '2', '9', '1', '5'];

describe('casillas del código (RV-470)', () => {
  describe('cifra a cifra, como siempre', () => {
    it('una cifra entra en su casilla y el foco pasa a la siguiente', () => {
      expect(escribirEnCasilla(vacias(), 0, '4', '4')).toEqual({ cifras: ['4', '', '', '', '', ''], foco: 1 });
    });

    it('una cifra tecleada encima de otra la sustituye, con el cursor a cualquier lado', () => {
      const cifras = ['4', '', '', '', '', ''];
      for (const valor of ['48', '84']) {
        expect(escribirEnCasilla(cifras, 0, valor, '8')).toEqual({ cifras: ['8', '', '', '', '', ''], foco: 1 });
        // Sin saber qué se insertó (un teclado que compone), se deduce igual.
        expect(escribirEnCasilla(cifras, 0, valor)).toEqual({ cifras: ['8', '', '', '', '', ''], foco: 1 });
      }
      expect(escribirEnCasilla(cifras, 0, '44')?.cifras).toEqual(cifras);
    });

    it('completar el código cifra a cifra no saca el foco de las casillas', () => {
      expect(escribirEnCasilla(['4', '8', '2', '9', '1', ''], 5, '5', '5')).toEqual({ cifras: CODIGO, foco: 5 });
      expect(escribirEnCasilla(['4', '8', '', '9', '1', '5'], 2, '2', '2')).toEqual({ cifras: CODIGO, foco: 3 });
    });

    it('borrar vacía la casilla y deja el foco donde está', () => {
      expect(escribirEnCasilla(['4', '8', '', '', '', ''], 1, '')).toEqual({
        cifras: ['4', '', '', '', '', ''],
        foco: null,
      });
    });

    it('una letra no cambia nada', () => {
      expect(escribirEnCasilla(vacias(), 0, 'a', 'a')).toBeNull();
      expect(escribirEnCasilla(['4', '', '', '', '', ''], 0, '4a', 'a')).toBeNull();
    });
  });

  describe('el código de golpe', () => {
    it('seis cifras en la primera casilla llenan las seis y el foco sale del código', () => {
      expect(escribirEnCasilla(vacias(), 0, '482915', '482915')).toEqual({ cifras: CODIGO, foco: 'completo' });
    });

    it('una sugerencia que sustituye el valor entero, sin decir qué insertó, entra tal cual', () => {
      expect(escribirEnCasilla(['4', '', '', '', '', ''], 0, '482915')).toEqual({ cifras: CODIGO, foco: 'completo' });
    });

    it('insertado detrás o delante de la cifra que ya había, no la cuenta (aunque empiece igual)', () => {
      const cifras = ['4', '', '', '', '', ''];
      expect(escribirEnCasilla(cifras, 0, '4482915', '482915')?.cifras).toEqual(CODIGO);
      expect(escribirEnCasilla(cifras, 0, '4829154', '482915')?.cifras).toEqual(CODIGO);
    });

    it('con espacios o guiones, solo cuentan las cifras', () => {
      expect(escribirEnCasilla(['4', '', '', '', '', ''], 0, '4482 915', '482 915')?.cifras).toEqual(CODIGO);
      expect(escribirEnCasilla(vacias(), 0, '482-915', '482-915')?.cifras).toEqual(CODIGO);
    });

    it('un código entero que entra en otra casilla va desde la primera', () => {
      expect(escribirEnCasilla(['1', '2', '', '', '', ''], 2, '482915', '482915')).toEqual({
        cifras: CODIGO,
        foco: 'completo',
      });
    });

    it('unas cifras sueltas desde la tercera se reparten hasta la sexta', () => {
      expect(escribirEnCasilla(['4', '8', '', '', '', ''], 2, '2915', '2915')).toEqual({
        cifras: CODIGO,
        foco: 'completo',
      });
    });

    it('varias cifras que no completan el código dejan el foco en la siguiente vacía', () => {
      expect(escribirEnCasilla(vacias(), 0, '482', '482')).toEqual({ cifras: ['4', '8', '2', '', '', ''], foco: 3 });
    });

    it('si sobran cifras, el foco se queda en las casillas para que se vea lo que ha entrado', () => {
      expect(escribirEnCasilla(vacias(), 3, '48291', '48291')).toEqual({
        cifras: ['', '', '', '4', '8', '2'],
        foco: 5,
      });
      expect(repartir(vacias(), 0, '4829153')).toEqual({ cifras: CODIGO, foco: 5 });
    });

    it('pegar reparte igual que insertar', () => {
      expect(repartir(['1', '', '', '', '', ''], 3, ' 482915 ')).toEqual({ cifras: CODIGO, foco: 'completo' });
    });
  });
});
