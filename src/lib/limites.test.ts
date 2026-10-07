// RV-155: cada campo de texto libre del voluntario lleva maxLength, y coincide con limites.ts
// (los mismos números que fn_validar_datos en el servidor, RV-140 / DEC-174).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIMITES } from './limites';

const RAIZ = resolve(__dirname, '../..');

/** Archivos del lado del voluntario con campos de texto que llegan al servidor. */
const ARCHIVOS = ['src/paginas/Proponer.tsx', 'src/paginas/Ajustes.tsx', 'src/paginas/Entrada.tsx'];

/** Etiquetas JSX `<input …>` y `<textarea …>` de un archivo, con sus atributos. */
function camposDe(ruta: string): string[] {
  const fuente = readFileSync(resolve(RAIZ, ruta), 'utf8');
  // Los campos son autocerrados (`/>`): así no corta en el `=>` de un manejador.
  return [...fuente.matchAll(/<(input|textarea)\b[\s\S]*?\/>/g)].map((m) => m[0]);
}

/** Campos de texto libre: no los de archivo, casillas, búsqueda, solo lectura, numéricos ni las casillas del código. */
function esTextoLibre(etiqueta: string): boolean {
  if (/type="(file|checkbox|radio|search)"/.test(etiqueta)) return false;
  if (/\breadOnly\b/.test(etiqueta)) return false;
  if (/inputMode="numeric"/.test(etiqueta)) return false;
  return true;
}

describe('RV-155 · límites de longitud', () => {
  it('son los de RV-140 (DEC-174)', () => {
    expect(LIMITES).toEqual({
      descripcion: 500,
      descripcion_fallo: 500,
      direccion: 200,
      nota: 1000,
      motivo: 1000,
      autor_nombre: 60,
      autor_apellido: 60,
    });
  });

  for (const ruta of ARCHIVOS) {
    it(`${ruta}: cada texto libre tiene maxLength de limites.ts`, () => {
      const campos = camposDe(ruta).filter(esTextoLibre);
      expect(campos.length).toBeGreaterThan(0);
      for (const c of campos) {
        const m = /maxLength=\{LIMITES\.(\w+)\}/.exec(c);
        expect(m, `sin maxLength={LIMITES.…}:\n${c}`).not.toBeNull();
        expect(Object.keys(LIMITES), c).toContain(m![1]);
      }
    });
  }
});
