import { describe, expect, it } from 'vitest';
import { entornoPg, esAfirmativo } from './comun.ts';

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
