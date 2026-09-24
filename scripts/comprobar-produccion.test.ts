import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type Fuentes,
  SECRETOS_ENTORNO,
  SECRETOS_PAGES,
  SECRETOS_REPO,
  VARIABLES_ENTORNO,
  codigoSalida,
  comprobar,
  esquemasDeAviso,
  nombresWrangler,
  requeridosDeWorkflow,
  tabla,
} from './comprobar-produccion.ts';
import { RAIZ } from './lib/comun.ts';
import type { Migracion } from './migrar.ts';

const LOCALES: Migracion[] = [
  { archivo: '0001_base.sql', contenido: 'x', hash: 'h1' },
  { archivo: '0002_mas.sql', contenido: 'y', hash: 'h2' },
];

/** Todo presente: lo que tendría producción al día. */
function fuentes(cambios: Partial<Fuentes> = {}): Fuentes {
  return {
    secretosEntorno: () => SECRETOS_ENTORNO.filter((s) => s !== 'PROPIETARIO_EMAIL'),
    variablesEntorno: () => [...VARIABLES_ENTORNO],
    secretosRepo: () => [...SECRETOS_REPO, 'PROPIETARIO_EMAIL'],
    secretosPages: () => [...SECRETOS_PAGES],
    migracionesAplicadas: () =>
      new Map([
        ['0001_base.sql', 'h1'],
        ['0002_mas.sql', 'h2'],
      ]),
    esquemasExpuestos: async () => ['public', 'graphql_public', 'hidrantes'],
    maxRows: async () => 1000,
    token: async () => ({ activo: true, workers: true, workersEdicion: true, pages: true }),
    ...cambios,
  };
}

describe('comprobar-produccion (docs/19 P-01)', () => {
  it('con todo presente, el código de salida es 0', async () => {
    const filas = await comprobar(fuentes(), LOCALES);
    expect(filas.filter((f) => f.estado !== 'OK')).toEqual([]);
    expect(codigoSalida(filas)).toBe(0);
  });

  it('faltan un secreto de Pages y una migración: la tabla lo dice y el código de salida es 1', async () => {
    const filas = await comprobar(
      fuentes({
        secretosPages: () => SECRETOS_PAGES.filter((s) => s !== 'VIGILANCIA_SECRETO'),
        migracionesAplicadas: () => new Map([['0001_base.sql', 'h1']]),
      }),
      LOCALES,
    );
    const texto = tabla(filas);
    expect(texto).toMatch(/Pages hidrantes-albolote · secretos \| VIGILANCIA_SECRETO \| FALTA/);
    expect(texto).toMatch(/migraciones pendientes \| OK \| se aplicarán al desplegar: 0002_mas\.sql/);
    expect(codigoSalida(filas)).toBe(1);
  });

  it('una migración aplicada con otro hash o que no está en el repositorio impide desplegar', async () => {
    const distinta = await comprobar(
      fuentes({
        migracionesAplicadas: () =>
          new Map([
            ['0001_base.sql', 'otro'],
            ['0002_mas.sql', 'h2'],
          ]),
      }),
      LOCALES,
    );
    expect(tabla(distinta)).toMatch(/0001_base\.sql \| FALTA \| hash distinto/);
    expect(codigoSalida(distinta)).toBe(1);
    const ajena = await comprobar(
      fuentes({
        migracionesAplicadas: () =>
          new Map([
            ['0001_base.sql', 'h1'],
            ['0002_mas.sql', 'h2'],
            ['0099_fantasma.sql', 'h9'],
          ]),
      }),
      LOCALES,
    );
    expect(codigoSalida(ajena)).toBe(1);
  });

  it('lo que no se puede consultar sale como NO COMPROBADO, nunca como OK', async () => {
    const filas = await comprobar(
      fuentes({
        secretosEntorno: () => null,
        migracionesAplicadas: () => null,
        token: async () => null,
        maxRows: async () => null,
      }),
      LOCALES,
    );
    expect(filas.filter((f) => f.estado === 'NO COMPROBADO').length).toBe(SECRETOS_ENTORNO.length + 3);
    expect(codigoSalida(filas)).toBe(0);
  });

  it('el token sin Workers Scripts dice el paso exacto y para', async () => {
    const filas = await comprobar(
      fuentes({ token: async () => ({ activo: true, workers: false, pages: true }) }),
      LOCALES,
    );
    expect(tabla(filas)).toMatch(/Workers Scripts \| FALTA \| Cloudflare → My Profile → API Tokens/);
    expect(codigoSalida(filas)).toBe(1);
  });

  // Tras el primer despliegue del Worker (24 sep 2026): el token veía los Workers pero no podía
  // desplegarlos. Leer los scripts no basta; los nombres de los secretos solo los lista con Edit.
  it('el token que ve los Workers pero no puede editarlos: Workers Scripts: Edit falta y para', async () => {
    const filas = await comprobar(
      fuentes({ token: async () => ({ activo: true, workers: true, workersEdicion: false, pages: true }) }),
      LOCALES,
    );
    expect(tabla(filas)).toMatch(/Workers Scripts: Edit \| FALTA \| Cloudflare → My Profile → API Tokens/);
    expect(codigoSalida(filas)).toBe(1);
    const sinWorker = await comprobar(
      fuentes({ token: async () => ({ activo: true, workers: true, workersEdicion: null, pages: true }) }),
      LOCALES,
    );
    expect(tabla(sinWorker)).toMatch(/Workers Scripts: Edit \| NO COMPROBADO \|/);
  });

  it('sin hidrantes en la Data API, falta; un db_max_rows distinto se anota pero no para', async () => {
    const sinEsquema = await comprobar(fuentes({ esquemasExpuestos: async () => ['public'] }), LOCALES);
    expect(codigoSalida(sinEsquema)).toBe(1);
    const topeDistinto = await comprobar(fuentes({ maxRows: async () => 500 }), LOCALES);
    expect(tabla(topeDistinto)).toMatch(/db_max_rows \| FALTA \| es 500: anótalo en 04/);
    expect(codigoSalida(topeDistinto)).toBe(0);
  });

  it('VITE_MAPABASE_URL es opcional: sin ella no para', async () => {
    const filas = await comprobar(
      fuentes({ variablesEntorno: () => VARIABLES_ENTORNO.filter((v) => v !== 'VITE_MAPABASE_URL') }),
      LOCALES,
    );
    expect(codigoSalida(filas)).toBe(0);
  });

  it('la salida nunca contiene valores', async () => {
    // Las fuentes solo dan nombres; aunque un valor se colara como nombre, la tabla solo pinta los
    // nombres esperados. Se inyectan valores centinela y se comprueba que no salen.
    const CENTINELAS = [
      'sk_valor_secreto_1234',
      'postgresql://usuario:clave@host/db', // detectar-secretos:permitir (centinela de prueba)
      'eyJhbGciOiJIUzI1NiJ9.cuerpo.firma', // detectar-secretos:permitir (centinela de prueba)
    ];
    const filas = await comprobar(
      fuentes({
        secretosEntorno: () => [...SECRETOS_ENTORNO, ...CENTINELAS],
        secretosPages: () => [...SECRETOS_PAGES, ...CENTINELAS],
        migracionesAplicadas: () =>
          new Map([
            ['0001_base.sql', CENTINELAS[0]!],
            ['0002_mas.sql', 'h2'],
          ]),
      }),
      LOCALES,
    );
    const texto = tabla(filas);
    for (const c of CENTINELAS) expect(texto).not.toContain(c);
  });
});

describe('lectura de las fuentes', () => {
  it('los nombres de wrangler pages secret list, sin valores', () => {
    const salida = [
      'The "production" environment of your Pages project "hidrantes-albolote" has access to the following secrets:',
      '  - SAL_IP: Value Encrypted',
      '  - VIGILANCIA_SECRETO: Value Encrypted',
    ].join('\n');
    expect(nombresWrangler(salida)).toEqual(['SAL_IP', 'VIGILANCIA_SECRETO']);
  });

  it('los esquemas expuestos salen del aviso PGRST106', () => {
    expect(
      esquemasDeAviso({
        code: 'PGRST106',
        hint: 'Only the following schemas are exposed: public, graphql_public, hidrantes',
      }),
    ).toEqual(['public', 'graphql_public', 'hidrantes']);
    expect(esquemasDeAviso({ code: 'PGRST202' })).toBeNull();
  });

  it('deploy-prod.yml no pide nada fuera de la lista de docs/19', () => {
    const yml = readFileSync(path.join(RAIZ, '.github', 'workflows', 'deploy-prod.yml'), 'utf8');
    const { secretos, variables } = requeridosDeWorkflow(yml);
    expect(secretos.filter((s) => !SECRETOS_ENTORNO.includes(s))).toEqual([]);
    expect(variables.filter((v) => !VARIABLES_ENTORNO.includes(v))).toEqual([]);
  });
});
