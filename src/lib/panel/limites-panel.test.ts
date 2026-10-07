// docs/31 RV-168: los textos libres del panel llevan el mismo maxLength que comprueba el servidor
// (src/lib/limites.ts, RV-140 / DEC-174): Editar, Retirar y Borrar, y la dirección de la tabla.
// La Cola (corregir, rechazar, "Rechazar seleccionadas") va en sus propios archivos y su propio test.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIMITES } from '../limites';

const RAIZ = resolve(__dirname, '../../..');

/** Archivo → el límite que toca a cada campo, por su `aria-label` o por ser el único `<textarea>`. */
const CAMPOS: Record<string, Record<string, keyof typeof LIMITES>> = {
  'src/componentes/panel/EditarPunto.tsx': {
    'T.formulario.descripcionFallo': 'descripcion_fallo',
    'T.ficha.direccion': 'direccion',
    'T.formulario.descripcionOpcional': 'descripcion',
  },
  'src/componentes/panel/dialogos.tsx': { textarea: 'motivo' },
  'src/componentes/panel/Inventario.tsx': { 'T.panelInventario.direccionDe': 'direccion' },
};

/** Etiquetas JSX `<input …/>` y `<textarea …/>` de un archivo. */
const camposDe = (ruta: string) =>
  [...readFileSync(resolve(RAIZ, ruta), 'utf8').matchAll(/<(input|textarea)\b[\s\S]*?\/>/g)].map((m) => m[0]);

/** Texto libre: no casillas, búsqueda, solo lectura ni números. */
const esTextoLibre = (c: string) =>
  !/type="(file|checkbox|radio|search|number|email)"/.test(c) &&
  !/\breadOnly\b/.test(c) &&
  !/inputMode="numeric"/.test(c);

describe('RV-168 · maxLength en el panel', () => {
  for (const [ruta, esperados] of Object.entries(CAMPOS)) {
    it(`${ruta}: cada texto libre tiene el maxLength de limites.ts que le toca`, () => {
      const campos = camposDe(ruta).filter(esTextoLibre);
      expect(campos.length).toBeGreaterThan(0);
      for (const c of campos) {
        const m = /maxLength=\{LIMITES\.(\w+)\}/.exec(c);
        expect(m, `sin maxLength={LIMITES.…}:\n${c}`).not.toBeNull();
        const clave = Object.keys(esperados).find((k) =>
          k === 'textarea' ? c.startsWith('<textarea') : c.includes(k),
        );
        expect(clave, `campo sin límite esperado en el test:\n${c}`).toBeDefined();
        expect(m![1], c).toBe(esperados[clave!]);
      }
    });
  }
});
