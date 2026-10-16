// docs/39 RV-518: antes de cualquier psql o pg_dump con secretos, la cadena tiene que ser del proyecto del entorno.

import { describe, expect, it } from 'vitest';
import { REFS } from './lib/comun.ts';
import { motivoComprobacion } from './comprobar-cadena.ts';

const cadena = (ref: string) =>
  `postgresql://hidrantes_migrador.${ref}:clave@aws-0-eu-west-3.pooler.supabase.com:5432/postgres`; // detectar-secretos:permitir (valor de prueba)

describe('comprobar-cadena', () => {
  it('la de staging en staging y la de prod en prod: bien', () => {
    expect(motivoComprobacion('staging', cadena(REFS.staging))).toBeNull();
    expect(motivoComprobacion('prod', cadena(REFS.prod))).toBeNull();
    expect(motivoComprobacion('produccion', cadena(REFS.prod))).toBeNull();
  });

  it('la de staging en prod, o al revés: se para', () => {
    expect(motivoComprobacion('prod', cadena(REFS.staging))).toMatch(/proyecto/);
    expect(motivoComprobacion('staging', cadena(REFS.prod))).toMatch(/proyecto/);
  });

  it('sin cadena, se para diciéndolo', () => {
    expect(motivoComprobacion('prod', undefined)).toMatch(/Falta la cadena/);
    expect(motivoComprobacion('prod', '')).toMatch(/Falta la cadena/);
  });

  it('el motivo nunca lleva la cadena', () => {
    const c = cadena('abcdefghijklmnopqrst');
    expect(motivoComprobacion('prod', c)).not.toContain('clave');
  });
});
