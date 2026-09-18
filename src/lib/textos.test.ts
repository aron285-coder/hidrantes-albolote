// TR-112: los textos de textos.ts coinciden con el Apéndice A de docs/06.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { T } from './textos';

const MARCA = '[]';
const normalizar = (s: string) => s.replace(/\[[^\]]*\]/g, MARCA).trim();

function literalesDelApendice(): Set<string> {
  const md = readFileSync(path.resolve(import.meta.dirname, '../../docs/06-sistema-de-diseno.md'), 'utf8');
  const inicio = md.indexOf('## Apéndice A');
  const fin = md.indexOf('\n## ', inicio + 1);
  expect(inicio, 'no encuentro el Apéndice A en docs/06').toBeGreaterThan(-1);
  const apendice = md.slice(inicio, fin === -1 ? undefined : fin).replace(/\s*\n\s*/g, ' ');
  return new Set([...apendice.matchAll(/`([^`]+)`/g)].map((m) => normalizar(m[1])));
}

function hojas(obj: object, prefijo = ''): [string, string][] {
  return Object.entries(obj).flatMap(([clave, valor]): [string, string][] => {
    const ruta = prefijo ? `${prefijo}.${clave}` : clave;
    if (typeof valor === 'string') return [[ruta, valor]];
    if (typeof valor === 'function') {
      const args = Array.from({ length: valor.length }, () => MARCA);
      return [[ruta, normalizar(String(valor(...args)))]];
    }
    return hojas(valor as object, ruta);
  });
}

describe('textos.ts', () => {
  const apendice = literalesDelApendice();

  it.each(hojas(T))('%s está en el Apéndice A', (_ruta, texto) => {
    expect(apendice.has(texto), `"${texto}" no está en el Apéndice A de 06; añádelo en el mismo PR`).toBe(true);
  });

  it('el cuarto nivel es "No funciona", nunca "Defecto" (00 §6)', () => {
    // "Capa por defecto" es legítimo: lo prohibido es "defecto" como estado de un punto.
    for (const [ruta, texto] of hojas(T)) expect(texto, ruta).not.toMatch(/^defectos?$/i);
    expect(T.formulario.noFunciona).toBe('No funciona');
  });
});
