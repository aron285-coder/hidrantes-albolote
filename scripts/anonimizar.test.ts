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
      entorno: 'produccion',
      admin: ADMIN,
      dispositivo: D,
    });
  });

  it('sin --buscar ni --dispositivo no hace nada', () => {
    expect(() => analizar(['--entorno', 'staging', '--admin', ADMIN])).toThrow(/No se ha cambiado nada/);
  });

  it.each([
    [['--admin', ADMIN, '--dispositivo', D], /--entorno/],
    [['--entorno', 'prod', '--admin', ADMIN, '--dispositivo', D], /Entorno desconocido/],
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
    expect(comprobarDestino('produccion', POOLER(REF_DE.produccion), undefined)).toEqual([]);
  });

  it('rechaza la cadena de staging con --entorno produccion, y al revés', () => {
    expect(comprobarDestino('produccion', POOLER(REF_DE.staging), undefined).join()).toMatch(/apunta al proyecto/);
    expect(comprobarDestino('staging', POOLER(REF_DE.produccion), undefined).join()).toMatch(/apunta al proyecto/);
  });

  it('rechaza otro usuario que no sea hidrantes_migrador (DEC-052)', () => {
    expect(comprobarDestino('produccion', POOLER(REF_DE.produccion, 'postgres'), undefined).join()).toMatch(
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

function dependencias(respuesta: string, vista: Record<string, unknown> = {}) {
  const consultas: string[] = [];
  const d: Dependencias = {
    consultar: vi.fn((sql: string) => {
      consultas.push(sql);
      if (sql.includes('fn_anonimizar_autor')) return '5';
      if (sql.includes('fn_actividad_voluntarios')) {
        return JSON.stringify([{ dispositivo_id: D, autor: 'Ana Ruiz', propuestas: 3, ultima: '2026-09-01T10:00:00+00' }]);
      }
      return JSON.stringify({ admin_activo: true, de_administrador: false, propuestas: 3, registro: 2, ...vista });
    }),
    preguntar: vi.fn(async () => respuesta),
    info: vi.fn(),
  };
  return { d, consultas };
}

const ORDEN = { modo: 'anonimizar', entorno: 'staging', admin: ADMIN, dispositivo: D } as const;

describe('anonimizar', () => {
  it.each(['', 'anonimizar', 'si', ' ANONIMIZAR '])('sin escribir exactamente ANONIMIZAR (%j) no cambia nada', async (r) => {
    const { d, consultas } = dependencias(r);
    await expect(anonimizar(ORDEN, d)).rejects.toThrow(/no se ha cambiado nada/);
    expect(consultas.some((s) => s.includes('fn_anonimizar_autor'))).toBe(false);
  });

  it('con ANONIMIZAR, enseña antes cuántas filas y llama a fn_anonimizar_autor como el administrador', async () => {
    const { d, consultas } = dependencias(CONFIRMACION);
    await expect(anonimizar(ORDEN, d)).resolves.toBe(5);
    expect(vi.mocked(d.info).mock.calls.flat().join('\n')).toMatch(/3 propuestas y 2 entradas/);
    expect(consultas).toHaveLength(2);
    expect(consultas[0]).not.toContain('fn_anonimizar_autor');
    expect(consultas[1]).toContain(`hidrantes.fn_anonimizar_autor('${D}'::uuid)`);
    expect(consultas[1]).toContain(`"email":"${ADMIN}"`);
  });

  it.each([
    [{ admin_activo: false }, /administrador activo/],
    [{ de_administrador: true }, /de un administrador/],
    [{ propuestas: 0, registro: 0 }, /No hay nada/],
  ])('no llega a preguntar si %j', async (vista, error) => {
    const { d, consultas } = dependencias(CONFIRMACION, vista);
    await expect(anonimizar(ORDEN, d)).rejects.toThrow(error);
    expect(d.preguntar).not.toHaveBeenCalled();
    expect(consultas).toHaveLength(1);
  });
});

describe('buscar', () => {
  it('lista dispositivo, nombre, propuestas y última actividad, sin cambiar nada', async () => {
    const { d, consultas } = dependencias('');
    await buscar({ modo: 'buscar', entorno: 'staging', admin: ADMIN, texto: 'Ana' }, d);
    const salida = vi.mocked(d.info).mock.calls.flat().join('\n');
    expect(salida).toContain(`${D} · Ana Ruiz · 3 propuestas · última: 2026-09-01`);
    expect(consultas.every((s) => !s.includes('fn_anonimizar_autor'))).toBe(true);
    expect(d.preguntar).not.toHaveBeenCalled();
  });
});
