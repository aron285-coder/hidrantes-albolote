// Nombres y valores de los campos de un punto en español (RV-23, UI-20, UI-21): los usan Mis
// propuestas (las correcciones de jefatura) y el panel (diff, fusión).

import { describe, expect, it } from 'vitest';
import { ETIQUETA_CAMPO, textoCambios } from './campos';

/** Claves de `datos` y `correcciones` de 05 §7. */
const CLAVES_05_7 = [
  'tipo',
  'diametro_mm',
  'diametro_otro',
  'caudal',
  'racor',
  'descripcion_fallo',
  'descripcion',
  'nota',
  'motivo_rapido',
  'motivo',
  'direccion',
];

describe('campos (RV-23)', () => {
  it('cada clave de 05 §7 tiene etiqueta', () => {
    for (const clave of CLAVES_05_7) expect(ETIQUETA_CAMPO[clave], clave).toBeTruthy();
  });

  it('las correcciones se leen en español, sin nombres de columna', () => {
    expect(textoCambios({ diametro_mm: 70, racor: 'granada' })).toBe('Diámetro: 70 mm · Racor: Granada');
    expect(textoCambios({ caudal: 'no_funciona', descripcion_fallo: 'Tapa soldada' })).toBe(
      'Estado: No funciona · Fallo: Tapa soldada',
    );
  });

  it('lo que no es un campo del punto no se enseña', () => {
    expect(textoCambios({ punto_id: '5eed', fusionada_con: 'HID-0147' })).toBeNull();
    expect(textoCambios(null)).toBeNull();
    expect(textoCambios({})).toBeNull();
  });
});
