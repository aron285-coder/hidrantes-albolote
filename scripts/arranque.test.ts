import { describe, expect, it } from 'vitest';
import { ErrorDeScript } from './lib/comun.ts';
import { ROTABLES, aRotar, pasoTrasSecretosPages, sufijoDe } from './arranque.ts';

describe('--rotar', () => {
  it('sin nada, no se rota nada: el arranque completo no es una rotación', () => {
    expect(aRotar(undefined).size).toBe(0);
    expect(aRotar('')).toEqual(new Set());
  });

  it('uno solo', () => {
    expect([...aRotar('gpg')]).toEqual(['gpg']);
  });

  it('varios separados por comas, que es lo que pide rehacer los secretos del respaldo (DEC-071)', () => {
    expect([...aRotar('db,gpg')]).toEqual(['db', 'gpg']);
    expect([...aRotar(' db , gpg ')]).toEqual(['db', 'gpg']);
  });

  it('"todo" son todos', () => {
    expect(aRotar('todo')).toEqual(new Set(ROTABLES));
  });

  it('un nombre inventado aborta diciendo cuáles hay, en vez de no rotar nada en silencio', () => {
    expect(() => aRotar('base-de-datos')).toThrow(ErrorDeScript);
    expect(() => aRotar('db,gpj')).toThrow(/gpj no existe/);
  });
});

describe('secreto de la vigilancia (RV-08)', () => {
  it('se puede rotar solo', () => {
    expect([...aRotar('vigilancia')]).toEqual(['vigilancia']);
    expect(aRotar('todo').has('vigilancia')).toBe(true);
  });
  it('su secreto de repositorio lleva el sufijo del entorno', () => {
    expect(sufijoDe({ clave: 'staging' })).toBe('STAGING');
    expect(sufijoDe({ clave: 'production' })).toBe('PROD');
  });
});

// docs/18 RV-38: un secreto de Pages nuevo solo vale en un despliegue nuevo.
describe('tras fijar los secretos de Pages', () => {
  it('staging se vuelve a desplegar desde develop', () => {
    expect(pasoTrasSecretosPages({ clave: 'staging' }).comando).toEqual([
      'workflow',
      'run',
      'Desplegar staging',
      '--ref',
      'develop',
    ]);
  });

  it('producción no se despliega sola: se dice el paso', () => {
    const paso = pasoTrasSecretosPages({ clave: 'production' });
    expect(paso.comando).toBeUndefined();
    expect(paso.aviso).toMatch(/develop → main/);
  });
});
