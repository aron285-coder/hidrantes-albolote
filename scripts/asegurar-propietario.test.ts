import { describe, expect, it } from 'vitest';
import { ErrorDeScript } from './lib/comun.ts';
import { sqlPropietario } from './asegurar-propietario.ts';

describe('sqlPropietario', () => {
  it('normaliza el correo y nunca pisa una fila existente', () => {
    const sql = sqlPropietario('  Alguien@Ejemplo.ES ');
    expect(sql).toContain("'alguien@ejemplo.es'");
    expect(sql).toContain('on conflict (email) do nothing');
    expect(sql).not.toMatch(/\bupdate\b/i);
  });

  it('solo anota en el registro si de verdad lo ha dado de alta', () => {
    expect(sqlPropietario('a@b.es')).toMatch(/from alta/);
  });

  it.each(["x'; drop table hidrantes.puntos; --@a.es", 'sin-arroba', 'a@b'])('rechaza %s', (e) => {
    expect(() => sqlPropietario(e)).toThrow(ErrorDeScript);
  });
});
