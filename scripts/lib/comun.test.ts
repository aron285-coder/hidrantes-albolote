import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { argsPsql, entornoPg, errorSeguro, esAfirmativo } from './comun.ts';

describe('esAfirmativo', () => {
  it.each(['s', 'S', 'si', 'Sí', ' s ', 'y', 'yes'])('"%s" es sí', (r) => expect(esAfirmativo(r)).toBe(true));
  it.each(['', 'n', 'no', 'ss', 'sss'])('"%s" no es sí', (r) => expect(esAfirmativo(r)).toBe(false));
});

describe('entornoPg', () => {
  it('separa la URL en variables PG* sin perder caracteres codificados', () => {
    const e = entornoPg('postgresql://hidrantes_migrador.ref:a%40b@pooler.example.com:5432/postgres'); // detectar-secretos:permitir (contraseña ficticia)
    expect(e).toMatchObject({
      PGHOST: 'pooler.example.com',
      PGPORT: '5432',
      PGUSER: 'hidrantes_migrador.ref',
      PGPASSWORD: 'a@b',
      PGDATABASE: 'postgres',
      PGSSLMODE: 'require',
    });
    expect(entornoPg('postgresql://postgres:postgres@127.0.0.1:55422/postgres').PGSSLMODE).toBe('disable');
  });
});

// docs/19 RV-53: un error de psql en Actions no puede llevar la fila (nombres de voluntarios).
describe('errorSeguro y VERBOSITY=terse', () => {
  const REAL = [
    'psql:<stdin>:3: ERROR:  new row for relation "propuestas" violates check constraint "propuestas_estado_check"',
    'DETAIL:  Failing row contains (0f1e2d3c-4b5a-4968-8776-6a5b4c3d2e1f, alta, {"caudal": "bueno"}, Ana, Pérez, d1, inventada, Luis Martín).',
    'CONTEXT:  SQL statement "insert into hidrantes.propuestas values (...)"',
    '    PL/pgSQL function hidrantes.fn_x() line 4 at SQL statement',
  ].join('\n');

  it('quita un DETAIL: Failing row contains (…, Ana, Pérez, …) real y deja el mensaje principal', () => {
    const limpio = errorSeguro(REAL);
    expect(limpio).toBe(
      'psql:<stdin>:3: ERROR:  new row for relation "propuestas" violates check constraint "propuestas_estado_check"',
    );
    for (const dato of ['Ana', 'Pérez', 'Luis', 'Failing row contains (0f']) expect(limpio).not.toContain(dato);
  });

  it('también un "Failing row contains" en la misma línea, y QUERY', () => {
    expect(errorSeguro('ERROR:  23502: null value in column "x" Failing row contains (Ana, Pérez).')).toBe(
      'ERROR:  23502: null value in column "x" Failing row contains (…)',
    );
    expect(errorSeguro('ERROR:  syntax error\nQUERY:  select Ana')).toBe('ERROR:  syntax error');
  });

  it('con CI, psql lleva VERBOSITY=terse; sin CI, solo si se pide', () => {
    const antes = process.env.CI;
    try {
      process.env.CI = '1';
      expect(argsPsql()).toContain('VERBOSITY=terse');
      delete process.env.CI;
      expect(argsPsql()).not.toContain('VERBOSITY=terse');
      expect(argsPsql({ terse: true })).toContain('VERBOSITY=terse');
    } finally {
      if (antes === undefined) delete process.env.CI;
      else process.env.CI = antes;
    }
  });
});

// Ningún script concatena un error de psql (u otro proceso) sin pasarlo por errorSeguro.
describe('scripts sin errores en crudo (RV-53)', () => {
  it('todo abortar(…)/log.aviso(…) que incluye un .error pasa por errorSeguro', () => {
    const carpeta = path.resolve(import.meta.dirname, '..');
    const archivos = [
      ...readdirSync(carpeta).filter((a) => a.endsWith('.ts') && !a.endsWith('.test.ts')),
      ...readdirSync(path.join(carpeta, 'lib'))
        .filter((a) => a.endsWith('.ts') && !a.endsWith('.test.ts'))
        .map((a) => `lib/${a}`),
    ];
    const malas: string[] = [];
    for (const a of archivos) {
      readFileSync(path.join(carpeta, a), 'utf8')
        .split('\n')
        .forEach((l, i) => {
          if (/\$\{[^}]*\.error\b/.test(l) && !/errorSeguro\(|errorDePromocion\(/.test(l)) malas.push(`${a}:${i + 1}`);
        });
    }
    expect(malas).toEqual([]);
  });
});
