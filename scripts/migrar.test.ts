import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ErrorDeScript } from './lib/comun.ts';
import { hashDe, leerMigraciones, planificar, type Migracion } from './migrar.ts';

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
