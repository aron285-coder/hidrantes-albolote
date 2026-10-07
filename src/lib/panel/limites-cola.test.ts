// docs/31 RV-168, la parte de la Cola: corregir, rechazar y "Rechazar seleccionadas" llevan el mismo
// maxLength que comprueba el servidor (src/lib/limites.ts, RV-140 / DEC-174). Sin él, un texto largo
// llega al servidor y vuelve como PAYLOAD_INVALIDO después de escribirlo entero.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIMITES } from '../limites';

const RAIZ = resolve(__dirname, '../../..');

/** Archivo → el límite de cada campo, por el `value` que lleva. */
const CAMPOS: Record<string, Record<string, keyof typeof LIMITES>> = {
  'src/componentes/panel/DetallePropuesta.tsx': {
    'value={direccion.valor}': 'direccion',
    'value={v.descripcion_fallo}': 'descripcion_fallo',
    'value={v.descripcion}': 'descripcion',
    'value={dir}': 'direccion',
    'value={motivo}': 'motivo',
  },
  'src/componentes/panel/ColaRevision.tsx': { 'value={motivo}': 'motivo' },
};

const camposDe = (ruta: string) =>
  [...readFileSync(resolve(RAIZ, ruta), 'utf8').matchAll(/<(input|textarea)\b[\s\S]*?\/>/g)].map((m) => m[0]);

/** Texto libre: no casillas ni números. */
const esTextoLibre = (c: string) => !/type="(checkbox|radio|number)"/.test(c);

describe('RV-168 · maxLength en la Cola', () => {
  for (const [ruta, esperados] of Object.entries(CAMPOS)) {
    it(`${ruta}: cada texto libre tiene el maxLength de limites.ts que le toca`, () => {
      const campos = camposDe(ruta).filter(esTextoLibre);
      expect(campos).toHaveLength(Object.keys(esperados).length);
      for (const c of campos) {
        const clave = Object.keys(esperados).find((k) => c.includes(k));
        expect(clave, `campo sin límite esperado en el test:\n${c}`).toBeDefined();
        const m = /maxLength=\{LIMITES\.(\w+)\}/.exec(c);
        expect(m, `sin maxLength={LIMITES.…}:\n${c}`).not.toBeNull();
        expect(m![1], c).toBe(esperados[clave!]);
      }
    });
  }
});
