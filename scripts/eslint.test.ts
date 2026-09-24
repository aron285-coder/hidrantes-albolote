// La regla de textos de interfaz (UI-20, TR-111, docs/17 RV-31): que siga pillando lo que debe.

import path from 'node:path';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: path.resolve(import.meta.dirname, '..') });

async function errores(codigo: string, archivo: string): Promise<string[]> {
  const [r] = await eslint.lintText(codigo, { filePath: archivo });
  return r!.messages.filter((m) => m.ruleId === 'no-restricted-syntax').map((m) => m.message);
}

describe('regla de textos de interfaz (RV-31)', () => {
  // La primera pasada de cada tipo de archivo carga su configuración y sus plugins: con la máquina
  // cargada pasaba de 5 s. Se calientan los dos, .ts y .tsx.
  beforeAll(async () => {
    await errores('export {};\n', 'src/lib/calentar.ts');
    await errores('export const X = () => null;\n', 'src/componentes/Calentar.tsx');
  }, 60_000);

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

  // docs/18 RV-50: los literales entre llaves solo cuentan donde se ven.
  it('{"Guardado"} como hijo o en un atributo visible da error', async () => {
    expect(await errores("export const X = () => <p>{'Guardado'}</p>;\n", 'src/componentes/X.tsx')).toHaveLength(1);
    expect(
      await errores("export const X = () => <button title={'Cerrar'} />;\n", 'src/componentes/X.tsx'),
    ).toHaveLength(1);
  });

  it('className={"x"} o type={"button"} no', async () => {
    const codigo = "export const X = () => <button type={'button'} className={'flex gap'} />;\n";
    expect(await errores(codigo, 'src/componentes/X.tsx')).toEqual([]);
  });

  it('los módulos sin interfaz de la lista no se miran; los demás sí', async () => {
    const codigo = "export const q = 'select id from hidrantes.puntos where activo';\n";
    expect(await errores(codigo, 'src/lib/api.ts')).toEqual([]);
    expect(await errores(codigo, 'src/lib/puntos.ts')).toHaveLength(1);
  });

  // docs/18 RV-50: '\S' en una cadena normal era 'S', y tres palabras sin acento pasaban.
  it('un .ts con tres palabras sin acento da error', async () => {
    expect(await errores("export const m = 'Guardar los cambios';\n", 'src/lib/mis-cosas.ts')).toHaveLength(1);
  });

  it('el marcado, las columnas de PostgREST y los mensajes de Error, no', async () => {
    const codigo = [
      'export const svg = (r: number) => `<circle r="${r}" fill="none" stroke="var(--x)"/>`;',
      'export const medio = (r: number) => `<line x1="${r}" y2="${-r}" stroke="var(--x)" stroke-width="2"/>`;',
      "export const columnas = 'id, operacion, estado, punto:puntos!punto_id(codigo, direccion)';",
      "export function f() { throw new Error('usePanel fuera del panel'); }",
      'export function g(n: number) { throw new RangeError(`Fuera del huso 30: ${n}`); }',
    ].join('\n');
    expect(await errores(`${codigo}\n`, 'src/lib/mis-cosas.ts')).toEqual([]);
  });

  it('una plantilla en className no; en un hijo, sí', async () => {
    const clase = 'export const X = ({ a }: { a: string }) => <div className={`flex gap-2 top-2 ${a}`} />;\n';
    expect(await errores(clase, 'src/componentes/X.tsx')).toEqual([]);
    const hijo = 'export const X = ({ n }: { n: number }) => <p>{`Tienes ${n} envíos`}</p>;\n';
    expect(await errores(hijo, 'src/componentes/X.tsx')).toHaveLength(1);
  });

  it('en textos.ts y en los tests, no', async () => {
    const codigo = "export const T = { a: 'Tienes envíos sin mandar' };\n";
    expect(await errores(codigo, 'src/lib/textos.ts')).toEqual([]);
    expect(await errores(codigo, 'src/lib/otra.test.ts')).toEqual([]);
  });
});
