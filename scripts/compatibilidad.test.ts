import { describe, expect, it } from 'vitest';
import {
  AVISO_SIN_PRODUCCION,
  URL_PRODUCCION,
  adaptarColumnasPermitidas,
  adaptarSesiones,
  cambianMigraciones,
  elegirReferencia,
  leerCommitProduccion,
  referenciaPorDefecto,
  tocaMigraciones,
  traerReferencia,
} from './compatibilidad.ts';
import type { Resultado } from './lib/comun.ts';

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
    expect(elegirReferencia({ GITHUB_BASE_REF: 'main' }, { commit: SHA, motivo: null })).toEqual({
      ref: SHA,
      aviso: null,
    });
  });

  it('si no se puede leer, origin/main con un aviso que dice por qué', () => {
    const r = elegirReferencia({ GITHUB_BASE_REF: 'main' }, { commit: null, motivo: 'responde 503' });
    expect(r.ref).toBe('origin/main');
    expect(r.aviso).toContain(AVISO_SIN_PRODUCCION);
    expect(r.aviso).toContain('Motivo: responde 503');
    // Un commit corto no se puede traer con git fetch: tampoco vale, y lo dice.
    const corto = elegirReferencia({ GITHUB_BASE_REF: 'main' }, { commit: SHA.slice(0, 7), motivo: null });
    expect(corto.ref).toBe('origin/main');
    expect(corto.aviso).toContain('no es un commit completo');
  });

  it('en un PR a develop, o fuera de un PR, como antes', () => {
    expect(elegirReferencia({ GITHUB_BASE_REF: 'develop' }, { commit: SHA, motivo: null })).toEqual({
      ref: 'origin/develop',
      aviso: null,
    });
    expect(elegirReferencia({}, null)).toEqual({ ref: 'origin/develop', aviso: null });
  });
});

describe('leerCommitProduccion', () => {
  const SHA = 'c37829132d4fcac60c9820abb122fe0bacca0d13';
  const respuesta = (ok: boolean, html: string, status?: number) => async () => ({
    ok,
    status,
    text: async () => html,
  });

  it('lee el commit de la portada de producción', async () => {
    let pedida = '';
    const lectura = await leerCommitProduccion(async (url) => {
      pedida = url;
      return { ok: true, text: async () => `<head><meta name="commit" content="${SHA}"></head>` };
    });
    expect(lectura).toEqual({ commit: SHA, motivo: null });
    expect(pedida).toBe(URL_PRODUCCION);
  });

  it('sin commit, con el motivo: error HTTP, sin meta o sin respuesta', async () => {
    expect((await leerCommitProduccion(respuesta(false, '', 503))).motivo).toContain('responde 503');
    expect((await leerCommitProduccion(respuesta(true, '<head></head>'))).motivo).toContain('<meta name="commit">');
    const caida = await leerCommitProduccion(async () => {
      throw new Error('The operation was aborted due to timeout');
    });
    expect(caida.commit).toBeNull();
    expect(caida.motivo).toContain('no responde (The operation was aborted due to timeout)');
  });
});

describe('traerReferencia y cambianMigraciones', () => {
  const SHA = 'c37829132d4fcac60c9820abb122fe0bacca0d13';
  /** git simulado: cada orden, su resultado; lo no previsto sale bien y vacío. */
  const git = (reglas: [RegExp, Resultado][]) => {
    const lineas: string[] = [];
    const ej = (comando: string, args: string[]): Resultado => {
      const linea = [comando, ...args].join(' ');
      lineas.push(linea);
      return reglas.find(([re]) => re.test(linea))?.[1] ?? { codigo: 0, salida: '', error: '' };
    };
    return { ej, lineas };
  };
  const mal: Resultado = { codigo: 128, salida: '', error: 'fatal: remote error: upload-pack: not our ref' };

  it('el commit de producción que se trae bien es la referencia', () => {
    const avisos: string[] = [];
    const { ej, lineas } = git([[/is-shallow/, { codigo: 0, salida: 'true', error: '' }]]);
    expect(traerReferencia(ej, SHA, false, (t) => avisos.push(t))).toBe(SHA);
    expect(lineas).toContain(`git fetch --depth 1 origin ${SHA}`);
    expect(avisos).toEqual([]);
  });

  it('si no se puede traer, origin/main con un aviso que dice por qué', () => {
    const avisos: string[] = [];
    const { ej, lineas } = git([[new RegExp(`fetch .*${SHA}`), mal]]);
    expect(traerReferencia(ej, SHA, false, (t) => avisos.push(t))).toBe('origin/main');
    expect(avisos[0]).toContain('not our ref');
    expect(lineas).toContain('git fetch origin main');
  });

  it('con --ref, un commit que no se puede traer para', () => {
    const { ej } = git([[new RegExp(`fetch .*${SHA}`), mal]]);
    expect(() => traerReferencia(ej, SHA, true, () => {})).toThrow(/not our ref/);
  });

  it('una rama que no se puede traer se avisa, no se calla', () => {
    const avisos: string[] = [];
    const { ej } = git([[/fetch origin develop/, mal]]);
    expect(traerReferencia(ej, 'origin/develop', false, (t) => avisos.push(t))).toBe('origin/develop');
    expect(avisos[0]).toContain('No se ha podido traer origin/develop');
  });

  it('si git diff falla, se para: no es «no cambian las migraciones»', () => {
    const { ej } = git([[/^git diff --name-only/, { codigo: 128, salida: '', error: 'fatal: bad revision' }]]);
    expect(() => cambianMigraciones(ej, SHA)).toThrow(/bad revision/);
    const bien = git([[/^git diff --name-only/, { codigo: 0, salida: 'supabase/migrations/0041_x.sql', error: '' }]]);
    expect(cambianMigraciones(bien.ej, SHA)).toBe(true);
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
