import { describe, expect, it } from 'vitest';
import { adaptarSesiones, referenciaPorDefecto, tocaMigraciones } from './compatibilidad.ts';

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

// docs/18 RV-36: el arnés anterior entra en el panel con contraseña, que ya no es jefatura.
describe('adaptarSesiones', () => {
  const anterior = [
    "import { T } from '../../src/lib/textos.ts';",
    '',
    'async function entrar() {',
    '  const sesion = await (',
    '    await request.post(`${api}/auth/v1/token?grant_type=password`, {',
    '      headers: { apikey: env.VITE_SUPABASE_ANON_KEY },',
    '      data: { email: correo, password: clave },',
    '    })',
    '  ).json();',
    '  expect(sesion.access_token).toBeTruthy();',
    '}',
  ].join('\n');

  it('firma como de Google la sesión con contraseña e importa el ayudante', () => {
    const adaptado = adaptarSesiones(anterior);
    expect(adaptado).toContain('const sesion = comoGoogle(await (');
    expect(adaptado).toContain('  ).json());');
    expect(adaptado).toContain("import { comoGoogle } from './sesion-google.ts';");
    expect(adaptado).toContain('grant_type=password');
  });

  it('un caso sin sesión de jefatura no se toca', () => {
    const otro = "import { T } from '../../src/lib/textos.ts';\ntest('x', () => {});\n";
    expect(adaptarSesiones(otro)).toBe(otro);
  });
});
