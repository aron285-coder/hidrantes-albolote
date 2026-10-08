import { describe, expect, it } from 'vitest';
import {
  AVISO_SIN_PRODUCCION,
  URL_PRODUCCION,
  adaptarColumnasPermitidas,
  adaptarSesiones,
  elegirReferencia,
  leerCommitProduccion,
  referenciaPorDefecto,
  tocaMigraciones,
} from './compatibilidad.ts';

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

// docs/32 RV-206: en un PR a main, contra lo que de verdad sirve producción, que puede ir por detrás.
describe('elegirReferencia', () => {
  const SHA = 'c37829132d4fcac60c9820abb122fe0bacca0d13';

  it('en un PR a main, el commit de <meta name="commit"> de producción', () => {
    expect(elegirReferencia({ GITHUB_BASE_REF: 'main' }, SHA)).toEqual({ ref: SHA, aviso: null });
  });

  it('si no se puede leer, origin/main con un aviso', () => {
    expect(elegirReferencia({ GITHUB_BASE_REF: 'main' }, null)).toEqual({
      ref: 'origin/main',
      aviso: AVISO_SIN_PRODUCCION,
    });
    // Un commit corto no se puede traer con git fetch: tampoco vale.
    expect(elegirReferencia({ GITHUB_BASE_REF: 'main' }, SHA.slice(0, 7)).ref).toBe('origin/main');
  });

  it('en un PR a develop, o fuera de un PR, como antes', () => {
    expect(elegirReferencia({ GITHUB_BASE_REF: 'develop' }, SHA)).toEqual({ ref: 'origin/develop', aviso: null });
    expect(elegirReferencia({}, null)).toEqual({ ref: 'origin/develop', aviso: null });
  });
});

describe('leerCommitProduccion', () => {
  const SHA = 'c37829132d4fcac60c9820abb122fe0bacca0d13';
  const respuesta = (ok: boolean, html: string) => async () => ({ ok, text: async () => html });

  it('lee el commit de la portada de producción', async () => {
    let pedida = '';
    const commit = await leerCommitProduccion(async (url) => {
      pedida = url;
      return { ok: true, text: async () => `<head><meta name="commit" content="${SHA}"></head>` };
    });
    expect(commit).toBe(SHA);
    expect(pedida).toBe(URL_PRODUCCION);
  });

  it('null si no responde, responde con error o no dice su commit', async () => {
    expect(await leerCommitProduccion(respuesta(false, ''))).toBeNull();
    expect(await leerCommitProduccion(respuesta(true, '<head></head>'))).toBeNull();
    expect(
      await leerCommitProduccion(async () => {
        throw new Error('timeout');
      }),
    ).toBeNull();
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

describe('adaptarColumnasPermitidas', () => {
  const anterior = "const PERMITIDAS = new Set([\n  'id',\n  'foto_path',\n  'municipio',\n]);\n";

  it('el caso de la Fase 5 de antes admite la foto del sitio (0035), y nada más', () => {
    const adaptado = adaptarColumnasPermitidas(anterior);
    expect(adaptado).toBe(
      "const PERMITIDAS = new Set([\n  'id',\n  'foto_path',\n  'foto_sitio_path',\n  'municipio',\n]);\n",
    );
    expect(adaptado).not.toContain('autor');
  });

  it('si ya la admite, o el archivo no tiene esa lista, no lo toca', () => {
    const ya = adaptarColumnasPermitidas(anterior);
    expect(adaptarColumnasPermitidas(ya)).toBe(ya);
    const otro = "test('x', () => {});\n";
    expect(adaptarColumnasPermitidas(otro)).toBe(otro);
  });
});
