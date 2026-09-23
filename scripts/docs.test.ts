// Que la documentación no vuelva a afirmar menos de lo que hay ni a llevar datos que no debe
// (docs/17 RV-32, DEC-053): el repositorio es público.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = path.resolve(import.meta.dirname, '..');
const CARPETAS = ['docs', 'src', 'e2e'];
const EXTENSIONES = /\.(md|html|ts|tsx|json|sql|css)$/;
/** Dominios de ejemplo; albolote-pc.es solo como genérico de los mockups (jefatura@…). */
const PERMITIDOS = /@(example\.(org|com)|albolote-pc\.es)$/i;

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) return nombre === 'node_modules' ? [] : archivos(ruta);
    return EXTENSIONES.test(nombre) ? [ruta] : [];
  });
}

describe('documentación honesta y sin datos personales (RV-32)', () => {
  it('ningún correo fuera de los dominios de ejemplo en docs, src ni e2e', () => {
    const fuera: string[] = [];
    for (const carpeta of CARPETAS) {
      for (const archivo of archivos(path.join(RAIZ, carpeta))) {
        const texto = readFileSync(archivo, 'utf8');
        for (const [correo] of texto.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)) {
          if (!PERMITIDOS.test(correo)) fuera.push(`${path.relative(RAIZ, archivo)}: ${correo}`);
        }
      }
    }
    expect(fuera).toEqual([]);
  });

  it('toda RPC hidrantes.fn_* con grant execute aparece en 05', () => {
    const doc05 = readFileSync(path.join(RAIZ, 'docs', '05-modelo-de-datos-y-api.md'), 'utf8');
    const dir = path.join(RAIZ, 'supabase', 'migrations');
    const concedidas = new Set<string>();
    for (const archivo of readdirSync(dir)) {
      const sql = readFileSync(path.join(dir, archivo), 'utf8');
      for (const bloque of sql.matchAll(/grant execute on function([\s\S]*?)\bto\b/gi)) {
        for (const [, nombre] of bloque[1]!.matchAll(/hidrantes\.(fn_\w+)/g)) concedidas.add(nombre!);
      }
    }
    expect(concedidas.size).toBeGreaterThan(20);
    const faltan = [...concedidas].filter((f) => !new RegExp(`\\b${f}\\b`).test(doc05)).sort();
    expect(faltan).toEqual([]);
  });
});
