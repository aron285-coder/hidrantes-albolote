// Nombres de las seis operaciones y errores de envío en palabras del voluntario (TR-36, FR-27).

import { describe, expect, it } from 'vitest';
import { ETIQUETA_OPERACION, TITULO_OPERACION, textoFallo } from './nombres-operacion';
import type { Operacion } from './propuestas';
import { T } from './textos';

const OPERACIONES: Operacion[] = ['alta', 'revision', 'estado', 'datos', 'ubicacion', 'retirada'];

describe('nombres de operación (00 §6)', () => {
  it('las seis operaciones tienen título y etiqueta, sin repetirse', () => {
    for (const o of OPERACIONES) {
      expect(TITULO_OPERACION[o]).toBeTruthy();
      expect(ETIQUETA_OPERACION[o]).toBeTruthy();
    }
    expect(new Set(Object.values(TITULO_OPERACION)).size).toBe(OPERACIONES.length);
    expect(new Set(Object.values(ETIQUETA_OPERACION)).size).toBe(OPERACIONES.length);
  });

  it('no se cuela "defecto": el cuarto nivel es "No funciona"', () => {
    const todos = [...Object.values(TITULO_OPERACION), ...Object.values(ETIQUETA_OPERACION)].join(' ');
    expect(todos.toLowerCase()).not.toContain('defecto');
  });
});

describe('textoFallo (TR-36)', () => {
  it('cada familia de códigos se explica con lo que le toca hacer al voluntario', () => {
    expect(textoFallo('PUNTO_NO_ACTIVO')).toBe(T.misPropuestas.errorNoActivo);
    expect(textoFallo('PUNTO_NO_EXISTE')).toBe(T.misPropuestas.errorNoActivo);
    expect(textoFallo('FOTO_NO_SUBIDA')).toBe(T.misPropuestas.errorFoto);
    expect(textoFallo('PAYLOAD_INVALIDO')).toBe(T.misPropuestas.errorDatos);
  });

  it('un código que no conocemos no deja la pantalla muda (UI-04)', () => {
    expect(textoFallo('ALGO_NUEVO_DEL_SERVIDOR')).toBe(T.misPropuestas.errorGenerico);
    expect(textoFallo('')).toBe(T.misPropuestas.errorGenerico);
  });
});
