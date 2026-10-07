import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ErrorDeScript } from './lib/comun.ts';
import { entornoPedido, hashDe, leerMigraciones, planificar, type Migracion } from './migrar.ts';

// docs/31 RV-134: --entorno con la función compartida; --local es --entorno local.
describe('entornoPedido', () => {
  const b = (...x: string[]) => new Set(x);
  const v = (o: Record<string, string> = {}) => new Map(Object.entries(o));

  it('--local, --entorno local y nada', () => {
    expect(entornoPedido(b('local'), v())).toBe('local');
    expect(entornoPedido(b(), v({ entorno: 'local' }))).toBe('local');
    expect(entornoPedido(b(), v())).toBeNull();
  });

  it('produccion vale por prod; otra cosa, o --entorno sin valor, aborta', () => {
    expect(entornoPedido(b(), v({ entorno: 'produccion' }))).toBe('prod');
    expect(() => entornoPedido(b(), v({ entorno: 'pre' }))).toThrow(ErrorDeScript);
    expect(() => entornoPedido(b('entorno'), v())).toThrow(/--entorno/);
  });

  it('--local con otro entorno no se admite', () => {
    expect(() => entornoPedido(b('local'), v({ entorno: 'prod' }))).toThrow(/a la vez/);
  });
});

const m = (archivo: string, contenido = `-- ${archivo}`): Migracion => ({
  archivo,
  contenido,
  hash: hashDe(contenido),
});

describe('planificar', () => {
  it('devuelve solo las pendientes, en orden', () => {
    const locales = [m('0001_a.sql'), m('0002_b.sql'), m('0003_c.sql')];
    const aplicadas = new Map([['0001_a.sql', locales[0].hash]]);
    expect(planificar(locales, aplicadas).map((x) => x.archivo)).toEqual(['0002_b.sql', '0003_c.sql']);
  });

  it('aborta si una migración aplicada cambió', () => {
    const aplicadas = new Map([['0001_a.sql', 'otro-hash']]);
    expect(() => planificar([m('0001_a.sql')], aplicadas)).toThrow(ErrorDeScript);
  });

  it('aborta si la base tiene una migración que el repositorio no', () => {
    expect(() => planificar([], new Map([['0001_a.sql', 'x']]))).toThrow(/no está en el repositorio/);
  });

  it('aborta si aparece una migración anterior a la última aplicada', () => {
    const locales = [m('0001_a.sql'), m('0002_b.sql'), m('0003_c.sql')];
    const aplicadas = new Map([
      ['0001_a.sql', locales[0].hash],
      ['0003_c.sql', locales[2].hash],
    ]);
    expect(() => planificar(locales, aplicadas)).toThrow(/anterior a la última/);
  });
});

describe('hashDe', () => {
  it('no depende del final de línea', () => {
    expect(hashDe('a\r\nb')).toBe(hashDe('a\nb'));
  });
});

describe('leerMigraciones', () => {
  it('sin carpeta de migraciones devuelve una lista vacía', () => {
    expect(leerMigraciones(path.join(tmpdir(), 'no-existe-' + Date.now()))).toEqual([]);
  });

  it('rechaza nombres fuera de formato y números repetidos', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'migr-'));
    writeFileSync(path.join(dir, 'mal nombre.sql'), '');
    expect(() => leerMigraciones(dir)).toThrow(/no válido/);

    const dir2 = mkdtempSync(path.join(tmpdir(), 'migr-'));
    writeFileSync(path.join(dir2, '0001_a.sql'), '');
    writeFileSync(path.join(dir2, '0001_b.sql'), '');
    expect(() => leerMigraciones(dir2)).toThrow(/mismo número|número 0001/);
  });
});
