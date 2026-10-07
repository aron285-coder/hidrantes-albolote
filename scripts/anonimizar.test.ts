// Anonimizar sin panel (docs/29 RV-126): los argumentos, la guarda del destino y que sin escribir
// ANONIMIZAR no se cambie nada. fn_anonimizar_autor tiene su pgTAP (17_registro_anonimizacion).

import { describe, expect, it, vi } from 'vitest';
import { ErrorDeScript } from './lib/comun.ts';
import {
  CONFIRMACION,
  REF_DE,
  analizarArgumentos,
  anonimizar,
  buscar,
  claimsDe,
  comprobarDestino,
  literal,
  sqlAnonimizar,
  sqlBuscar,
  sqlVistaPrevia,
  ultimaLinea,
  type Dependencias,
} from './anonimizar.ts';

const D = '0b9c2f3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ADMIN = 'jefa@example.com';
const POOLER = (ref: string, usuario = 'hidrantes_migrador') =>
  `postgresql://${usuario}.${ref}:clave@aws-0-eu-west-3.pooler.supabase.com:5432/postgres`; // detectar-secretos:permitir (cadena de ejemplo, sin valores reales)

function args(lista: string[]): [Set<string>, Map<string, string>] {
  const banderas = new Set<string>();
  const valores = new Map<string, string>();
  for (let i = 0; i < lista.length; i++) {
    const clave = lista[i].slice(2);
    if (lista[i + 1] !== undefined && !lista[i + 1].startsWith('--')) valores.set(clave, lista[++i]);
    else banderas.add(clave);
  }
  return [banderas, valores];
}
const analizar = (lista: string[]) => analizarArgumentos(...args(lista));

describe('argumentos', () => {
  it('--buscar con entorno y administrador', () => {
    expect(analizar(['--entorno', 'staging', '--admin', 'Jefa@Example.com', '--buscar', ' Ana Ruiz '])).toEqual({
      modo: 'buscar',
      entorno: 'staging',
      admin: ADMIN,
      texto: 'Ana Ruiz',
    });
  });

  it('--dispositivo con entorno y administrador', () => {
    expect(analizar(['--entorno', 'produccion', '--admin', ADMIN, '--dispositivo', D.toUpperCase()])).toEqual({
      modo: 'anonimizar',
      entorno: 'prod',
      admin: ADMIN,
      dispositivo: D,
    });
  });

  it('acepta prod, como npm run restaurar', () => {
    expect(analizar(['--entorno', 'prod', '--admin', ADMIN, '--dispositivo', D]).entorno).toBe('prod');
  });

  it('sin --buscar ni --dispositivo no hace nada', () => {
    expect(() => analizar(['--entorno', 'staging', '--admin', ADMIN])).toThrow(/No se ha cambiado nada/);
  });

  it.each([
    [['--admin', ADMIN, '--dispositivo', D], /--entorno/],
    [['--entorno', 'pre', '--admin', ADMIN, '--dispositivo', D], /Entorno desconocido/],
    [['--entorno', 'staging', '--dispositivo', D], /--admin/],
    [['--entorno', 'staging', '--admin', 'no-es-correo', '--dispositivo', D], /correo/],
    [['--entorno', 'staging', '--admin', "x'@example.com", '--dispositivo', D], /correo/],
    [['--entorno', 'staging', '--admin', ADMIN, '--dispositivo', 'Ana'], /uuid/],
    [['--entorno', 'staging', '--admin', ADMIN, '--dispositivo'], /necesita un valor/],
    [['--entorno', 'staging', '--admin', ADMIN, '--buscar', 'Ana', '--dispositivo', D], /no los dos/],
    [['--entorno', 'staging', '--admin', ADMIN, '--buscar', '%'], /--buscar/],
    [['--entorno', 'staging', '--admin', ADMIN, '--buscar', "a'; drop table x; --"], /--buscar/],
    [['--entorno', 'staging', '--admin', ADMIN, '--dispositivo', D, '--confirmar', 'ANONIMIZAR'], /desconocida/],
  ])('rechaza %j', (lista, error) => {
    expect(() => analizar(lista)).toThrow(ErrorDeScript);
    expect(() => analizar(lista)).toThrow(error);
  });
});

describe('guarda del destino', () => {
  it('staging y producción, cada uno con su proyecto y hidrantes_migrador', () => {
    expect(comprobarDestino('staging', POOLER(REF_DE.staging), undefined)).toEqual([]);
    expect(comprobarDestino('prod', POOLER(REF_DE.prod), undefined)).toEqual([]);
  });

  it('rechaza la cadena de staging con --entorno produccion, y al revés', () => {
    expect(comprobarDestino('prod', POOLER(REF_DE.staging), undefined).join()).toMatch(/apunta al proyecto/);
    expect(comprobarDestino('staging', POOLER(REF_DE.prod), undefined).join()).toMatch(/apunta al proyecto/);
  });

  it('rechaza otro usuario que no sea hidrantes_migrador (DEC-052)', () => {
    expect(comprobarDestino('prod', POOLER(REF_DE.prod, 'postgres'), undefined).join()).toMatch(
      /hidrantes_migrador/,
    );
  });

  it('rechaza una cadena que no es URL', () => {
    expect(comprobarDestino('staging', 'no es una url', undefined).join()).toMatch(/URL/);
  });

  it('nunca en CI, ni siquiera en local', () => {
    expect(comprobarDestino('local', '', 'true').join()).toMatch(/CI/);
    expect(comprobarDestino('staging', POOLER(REF_DE.staging), 'true').join()).toMatch(/CI/);
  });
});

describe('SQL', () => {
  it('literal dobla las comillas', () => {
    expect(literal("O'Brien")).toBe("'O''Brien'");
  });

  it('los claims son de una sesión de Google del administrador, locales a la transacción', () => {
    const c = JSON.parse(claimsDe(ADMIN, 1));
    expect(c).toEqual({
      role: 'authenticated',
      email: ADMIN,
      amr: [{ method: 'oauth', timestamp: 1 }],
      app_metadata: { provider: 'google', providers: ['google'] },
    });
    const sql = sqlAnonimizar(ADMIN, D);
    expect(sql).toMatch(/^begin;/);
    expect(sql).toMatch(/set_config\('request\.jwt\.claims', '.*', true\)/);
    expect(sql).toContain(`hidrantes.fn_anonimizar_autor('${D}'::uuid)`);
    expect(sql.trim()).toMatch(/commit;$/);
  });

  it('buscar usa fn_actividad_voluntarios y siempre deshace', () => {
    const sql = sqlBuscar(ADMIN, "D'Ana");
    expect(sql).toContain('hidrantes.fn_actividad_voluntarios(1200)');
    expect(sql).toContain("ilike '%D''Ana%'");
    expect(sql.trim()).toMatch(/rollback;$/);
    expect(sql).not.toContain('fn_anonimizar_autor');
  });

  it('la vista previa solo lee', () => {
    const sql = sqlVistaPrevia(ADMIN, D);
    expect(sql).not.toMatch(/\b(update|insert|delete|fn_anonimizar_autor)\b/i);
  });

  it('ultimaLinea toma la respuesta final de psql', () => {
    expect(ultimaLinea('t\r\n7\r\n')).toBe('7');
    expect(ultimaLinea('')).toBe('');
  });
});

const VISTA = {
  admin_activo: true,
  de_administrador: false,
  propuestas: 3,
  registro: 2,
  pendientes_propuestas: 3,
  pendientes_registro: 2,
};

function dependencias(
  respuesta: string,
  {
    vista = {},
    resultado = '5',
    busqueda,
  }: { vista?: Record<string, unknown>; resultado?: string; busqueda?: string } = {},
) {
  const lecturas: string[] = [];
  const escrituras: string[] = [];
  const d: Dependencias = {
    consultar: vi.fn((sql: string) => {
      lecturas.push(sql);
      if (sql.includes('fn_actividad_voluntarios')) {
        return (
          busqueda ??
          JSON.stringify([{ dispositivo_id: D, autor: 'Ana Ruiz', propuestas: 3, ultima: '2026-09-01T10:00:00+00' }])
        );
      }
      return JSON.stringify({ ...VISTA, ...vista });
    }),
    escribir: vi.fn((sql: string) => {
      escrituras.push(sql);
      return resultado;
    }),
    preguntar: vi.fn(async () => respuesta),
    info: vi.fn(),
    aviso: vi.fn(),
  };
  return { d, lecturas, escrituras };
}

const ORDEN = { modo: 'anonimizar', entorno: 'staging', admin: ADMIN, dispositivo: D } as const;

describe('anonimizar', () => {
  it.each(['', 'anonimizar', 'si', ' ANONIMIZAR '])(
    'sin escribir exactamente ANONIMIZAR (%j) no cambia nada',
    async (r) => {
      const { d, lecturas, escrituras } = dependencias(r);
      await expect(anonimizar(ORDEN, d)).rejects.toThrow(/no se ha cambiado nada/);
      expect(escrituras).toEqual([]);
      expect(lecturas.some((s) => s.includes('fn_anonimizar_autor'))).toBe(false);
    },
  );

  it('con ANONIMIZAR, enseña antes cuántas filas y llama a fn_anonimizar_autor como el administrador', async () => {
    const { d, lecturas, escrituras } = dependencias(CONFIRMACION);
    await expect(anonimizar(ORDEN, d)).resolves.toBe(5);
    expect(vi.mocked(d.info).mock.calls.flat().join('\n')).toMatch(/3 propuestas y 2 entradas/);
    expect(lecturas).toHaveLength(1);
    expect(lecturas[0]).not.toContain('fn_anonimizar_autor');
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0]).toContain(`hidrantes.fn_anonimizar_autor('${D}'::uuid)`);
    expect(escrituras[0]).toContain(`"email":"${ADMIN}"`);
    expect(d.aviso).not.toHaveBeenCalled();
  });

  it('cuenta solo lo que aún tiene nombre', async () => {
    const { d } = dependencias(CONFIRMACION, { vista: { pendientes_propuestas: 1, pendientes_registro: 0 } });
    await anonimizar(ORDEN, d);
    expect(vi.mocked(d.info).mock.calls.flat().join('\n')).toMatch(/1 propuestas y 0 entradas/);
  });

  it.each([
    [{ admin_activo: false }, /administrador activo/],
    [{ de_administrador: true }, /de un administrador/],
    [{ propuestas: 0, registro: 0, pendientes_propuestas: 0, pendientes_registro: 0 }, /No hay nada/],
    [{ pendientes_propuestas: 0, pendientes_registro: 0 }, /ya está anonimizado/],
    [{ propuestas: undefined }, /Respuesta inesperada/],
    [{ admin_activo: 'sí' }, /Respuesta inesperada/],
  ])('no llega a preguntar si %j', async (vista, error) => {
    const { d, escrituras } = dependencias(CONFIRMACION, { vista });
    await expect(anonimizar(ORDEN, d)).rejects.toThrow(error);
    expect(d.preguntar).not.toHaveBeenCalled();
    expect(escrituras).toEqual([]);
  });

  it('una respuesta que no es JSON da un error limpio, sin repetirla', async () => {
    const { d } = dependencias(CONFIRMACION);
    vi.mocked(d.consultar).mockReturnValue('Ana Ruiz no es JSON');
    const error = await anonimizar(ORDEN, d).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorDeScript);
    expect(String(error)).not.toContain('Ana');
    expect(d.preguntar).not.toHaveBeenCalled();
  });

  it.each(['', 'null', 'x'])('si la anonimización no devuelve un número (%j), no dice que ha ido bien', async (r) => {
    const { d } = dependencias(CONFIRMACION, { resultado: r });
    await expect(anonimizar(ORDEN, d)).rejects.toThrow(/comprueba en el Registro/);
  });

  it('avisa si cambian más filas de las que contó la vista previa', async () => {
    const { d } = dependencias(CONFIRMACION, { resultado: '6' });
    await expect(anonimizar(ORDEN, d)).resolves.toBe(6);
    expect(vi.mocked(d.aviso).mock.calls.flat().join()).toMatch(/6 filas y la vista previa contaba 5/);
  });
});

describe('buscar', () => {
  it('lista dispositivo, nombre, propuestas y última actividad, sin cambiar nada', async () => {
    const { d, lecturas, escrituras } = dependencias('');
    await buscar({ modo: 'buscar', entorno: 'staging', admin: ADMIN, texto: 'Ana' }, d);
    const salida = vi.mocked(d.info).mock.calls.flat().join('\n');
    expect(salida).toContain(`${D} · Ana Ruiz · 3 propuestas · última: 2026-09-01`);
    expect(lecturas.every((s) => !s.includes('fn_anonimizar_autor'))).toBe(true);
    expect(escrituras).toEqual([]);
    expect(d.preguntar).not.toHaveBeenCalled();
  });

  it('sin coincidencias lo dice y explica que busca el nombre más reciente', async () => {
    const { d } = dependencias('', { busqueda: '[]' });
    await buscar({ modo: 'buscar', entorno: 'staging', admin: ADMIN, texto: 'Ana' }, d);
    expect(vi.mocked(d.info).mock.calls.flat().join('\n')).toMatch(/Ningún autor[\s\S]*más reciente/);
  });

  it('una respuesta que no es una lista da un error limpio', async () => {
    const { d } = dependencias('', { busqueda: '{"a":1}' });
    await expect(buscar({ modo: 'buscar', entorno: 'staging', admin: ADMIN, texto: 'Ana' }, d)).rejects.toThrow(
      /Respuesta inesperada/,
    );
  });
});
