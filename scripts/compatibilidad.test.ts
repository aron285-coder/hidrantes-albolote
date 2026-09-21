import { describe, expect, it } from 'vitest';
import { referenciaPorDefecto, tocaMigraciones } from './compatibilidad.ts';

describe('referenciaPorDefecto', () => {
  it('en un PR, la rama contra la que se fusiona: es la que está publicada', () => {
    expect(referenciaPorDefecto({ GITHUB_BASE_REF: 'develop' })).toBe('origin/develop');
    expect(referenciaPorDefecto({ GITHUB_BASE_REF: 'main' })).toBe('origin/main');
  });

  it('fuera de un PR, develop, que es lo que hay en staging', () => {
    expect(referenciaPorDefecto({})).toBe('origin/develop');
    expect(referenciaPorDefecto({ GITHUB_BASE_REF: '' })).toBe('origin/develop');
  });
});

describe('tocaMigraciones', () => {
  it('una migración nueva o cambiada sí', () => {
    expect(tocaMigraciones('supabase/migrations/0012_algo.sql')).toBe(true);
    expect(tocaMigraciones('docs/05-modelo-de-datos-y-api.md\nsupabase/migrations/0012_algo.sql\n')).toBe(true);
  });

  it('sin migraciones no hay nada que comprobar: la base de datos no cambia', () => {
    expect(tocaMigraciones('')).toBe(false);
    expect(tocaMigraciones('src/componentes/Mapa.tsx\ndocs/06-sistema-de-diseno.md')).toBe(false);
  });

  it('lo que hay al lado de las migraciones no cuenta', () => {
    expect(tocaMigraciones('supabase/tests/09_cobertura.test.sql')).toBe(false);
    expect(tocaMigraciones('supabase/migrations/LEEME.md')).toBe(false);
  });
});
