// La regla de textos de interfaz (UI-20, TR-111, docs/17 RV-31): que siga pillando lo que debe.

import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: path.resolve(import.meta.dirname, '..') });

async function errores(codigo: string, archivo: string): Promise<string[]> {
  const [r] = await eslint.lintText(codigo, { filePath: archivo });
  return r!.messages.filter((m) => m.ruleId === 'no-restricted-syntax').map((m) => m.message);
}

describe('regla de textos de interfaz (RV-31)', () => {
  it('un .tsx con <p>Guardado</p> da error, aunque sea una sola palabra sin acento', async () => {
    expect(await errores('export const X = () => <p>Guardado</p>;\n', 'src/componentes/X.tsx')).toHaveLength(1);
  });

  it('un atributo visible corto también', async () => {
    expect(
      await errores('export const X = () => <button aria-label="Cerrar" />;\n', 'src/componentes/X.tsx'),
    ).toHaveLength(1);
  });

  it('T.x no', async () => {
    const codigo = "import { T } from '@/lib/textos';\nexport const X = () => <p>{T.ajustes.guardar}</p>;\n";
    expect(await errores(codigo, 'src/componentes/X.tsx')).toEqual([]);
  });

  it('un .ts de interfaz con una plantilla en español da error', async () => {
    const codigo = 'export const f = (n: number) => `Tienes ${n} envíos sin mandar`;\n';
    expect(await errores(codigo, 'src/lib/mis-cosas.ts')).toHaveLength(1);
  });

  it('en textos.ts y en los tests, no', async () => {
    const codigo = "export const T = { a: 'Tienes envíos sin mandar' };\n";
    expect(await errores(codigo, 'src/lib/textos.ts')).toEqual([]);
    expect(await errores(codigo, 'src/lib/otra.test.ts')).toEqual([]);
  });
});
