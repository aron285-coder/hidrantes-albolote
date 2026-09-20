// Los códigos de 05 §8 en palabras de jefatura (TR-36, UI-04): ninguno puede quedarse mudo ni salir
// con el texto genérico cuando sabemos qué pasó.

import { describe, expect, it } from 'vitest';
import { SIN_SERVIDOR } from '../api';
import { T } from '../textos';
import { textoError } from './errores';

const CODIGOS = [
  'PROPUESTA_NO_PENDIENTE',
  'PUNTO_NO_ACTIVO',
  'PROPUESTA_DESACTUALIZADA',
  'DIAMETRO_SIN_FIJAR',
  'MOTIVO_OBLIGATORIO',
  'TIPO_DISTINTO',
  'PROPUESTA_NO_ALTA',
  'PAYLOAD_INVALIDO',
  'FUERA_DE_PLAZO_PAPELERA',
  'CODIGO_FORMATO',
  'ULTIMO_ADMINISTRADOR',
  'CONFIG_INVALIDA',
  'NO_AUTORIZADO',
  'NO_CONFIGURADO',
  SIN_SERVIDOR,
];

describe('textoError (05 §8, UI-04)', () => {
  it('cada código conocido tiene su propio texto, no el genérico', () => {
    for (const c of CODIGOS) {
      expect(textoError(c), c).toBeTruthy();
      expect(textoError(c), c).not.toBe(T.panelErrores.generico);
    }
  });

  it('el detalle entre paréntesis no cambia el mensaje', () => {
    expect(textoError('DIAMETRO_SIN_FIJAR(hidrante)')).toBe(textoError('DIAMETRO_SIN_FIJAR'));
    expect(textoError('PAYLOAD_INVALIDO(caudal)')).toBe(T.panelErrores.datos);
  });

  it('un código nuevo del servidor se explica en general, nunca en blanco', () => {
    expect(textoError('LO_QUE_SEA')).toBe(T.panelErrores.generico);
    expect(textoError('')).toBe(T.panelErrores.generico);
  });

  it('ningún texto delata a quién pertenece un correo o un nombre (FR-27)', () => {
    for (const c of [...CODIGOS, 'LO_QUE_SEA']) expect(textoError(c)).not.toMatch(/@/);
  });
});
