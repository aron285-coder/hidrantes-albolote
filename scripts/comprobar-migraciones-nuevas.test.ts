import { describe, expect, it } from 'vitest';
import { leerCambios, problemasDeMigraciones } from './comprobar-migraciones-nuevas.ts';

const M = 'supabase/migrations';
const base = [`${M}/0028_version_callejero.sql`, `${M}/0029_suscripciones_push_servicios_conocidos.sql`];

describe('problemasDeMigraciones (DEC-100)', () => {
  it('una migración nueva con número mayor que la última de la base pasa', () => {
    expect(problemasDeMigraciones([{ estado: 'A', archivo: `${M}/0030_nueva.sql` }], base)).toEqual([]);
  });

  it('una nueva con número menor o igual falla y dice a cuál renumerar', () => {
    expect(problemasDeMigraciones([{ estado: 'A', archivo: `${M}/0029_otra.sql` }], base)).toEqual([
      `${M}/0029_otra.sql: renumera a 0030: develop ya tiene hasta 0029`,
    ]);
    expect(problemasDeMigraciones([{ estado: 'A', archivo: `${M}/0015_vieja.sql` }], base, 'main')).toEqual([
      `${M}/0015_vieja.sql: renumera a 0030: main ya tiene hasta 0029`,
    ]);
  });

  it('dos nuevas fuera de orden no se proponen el mismo número, ni uno que ya trae el PR', () => {
    const cambios = [
      { estado: 'A', archivo: `${M}/0029_a.sql` },
      { estado: 'A', archivo: `${M}/0030_b.sql` },
      { estado: 'A', archivo: `${M}/0029_c.sql` },
    ];
    expect(problemasDeMigraciones(cambios, base)).toEqual([
      `${M}/0029_a.sql: renumera a 0031: develop ya tiene hasta 0029`,
      `${M}/0029_c.sql: renumera a 0032: develop ya tiene hasta 0029`,
    ]);
  });

  it('una migración de la base modificada o borrada falla', () => {
    expect(
      problemasDeMigraciones(
        [
          { estado: 'M', archivo: base[0]! },
          { estado: 'D', archivo: base[1]! },
        ],
        base,
      ),
    ).toEqual([
      `${base[0]}: el PR modifica una migración que ya está en develop; se corrige con otra nueva`,
      `${base[1]}: el PR borra una migración que ya está en develop; se corrige con otra nueva`,
    ]);
  });

  it('un PR sin migraciones pasa', () => {
    expect(problemasDeMigraciones([], base)).toEqual([]);
  });

  it('la primera migración de una base sin ninguna pasa', () => {
    expect(problemasDeMigraciones([{ estado: 'A', archivo: `${M}/0001_inicio.sql` }], [])).toEqual([]);
  });
});

describe('leerCambios', () => {
  it('lee la salida de git diff --name-status', () => {
    expect(leerCambios(`A\t${M}/0030_nueva.sql\nM\t${M}/0029_x.sql\n`)).toEqual([
      { estado: 'A', archivo: `${M}/0030_nueva.sql` },
      { estado: 'M', archivo: `${M}/0029_x.sql` },
    ]);
    expect(leerCambios('')).toEqual([]);
  });
});
