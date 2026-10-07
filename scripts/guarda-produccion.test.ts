import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { comprobarGuarda } from './guarda-produccion.ts';

const REF = 'abcdefghijklmnopqrst';
const STAGING = 'zzzzzzzzzzzzzzzzzzzz';
/** Un JWT con esa carga y una firma cualquiera: la guarda no verifica la firma, solo el proyecto. */
const jwt = (carga: object) =>
  ['{"alg":"HS256","typ":"JWT"}', JSON.stringify(carga)].map((p) => Buffer.from(p).toString('base64url')).join('.') +
  '.firma';
const flujoReal = readFileSync(path.resolve(import.meta.dirname, '../.github/workflows/deploy-prod.yml'), 'utf8');
const bien = {
  entorno: 'produccion',
  proyectoPages: 'hidrantes-albolote',
  ref: REF,
  supabaseUrl: `https://${REF}.supabase.co`,
  dbUrl: `postgresql://hidrantes_migrador.${REF}:x@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
  viteSupabaseUrl: `https://${REF}.supabase.co`,
  anonKey: jwt({ iss: 'supabase', ref: REF, role: 'anon' }),
  flujo: flujoReal,
  arranque: readFileSync(path.resolve(import.meta.dirname, 'arranque.ts'), 'utf8'),
};

describe('guarda de producción', () => {
  it('deja pasar la configuración correcta, el deploy-prod.yml real y el arranque.ts real', () => {
    expect(comprobarGuarda(bien)).toEqual([]);
  });

  it.each([
    ['entorno de staging', { entorno: 'staging' }],
    ['proyecto de Pages de staging', { proyectoPages: 'hidrantes-albolote-staging' }],
    ['URL de otro proyecto', { supabaseUrl: 'https://zzzzzzzzzzzzzzzzzzzz.supabase.co' }],
    ['conexión como postgres', { dbUrl: `postgresql://postgres.${REF}:x@h:5432/postgres` }],
    ['flujo que carga el seed', { flujo: 'run: psql -f supabase/seed-staging.sql' }],
    // RV-86: el servidor de push falso de las pruebas nunca llega a producción.
    ['PUSH_ENDPOINT_PRUEBAS en el entorno', { pushEndpointPruebas: 'http://127.0.0.1:9912' }],
    ['flujo que define PUSH_ENDPOINT_PRUEBAS', { flujo: 'env:\n  PUSH_ENDPOINT_PRUEBAS: http://127.0.0.1:9912' }],
    ['arranque que lo sube como secreto de Pages', { arranque: "secretos.PUSH_ENDPOINT_PRUEBAS = 'x';" }],
  ])('bloquea: %s', (_n, cambio) => {
    expect(comprobarGuarda({ ...bien, ...cambio }).length).toBeGreaterThan(0);
  });

  // docs/31 RV-136: el frontend que se construye para producción habla con producción.
  it.each([
    ['VITE_SUPABASE_URL de staging', { viteSupabaseUrl: `https://${STAGING}.supabase.co` }, 'VITE_SUPABASE_URL'],
    ['VITE_SUPABASE_URL vacía', { viteSupabaseUrl: undefined }, 'VITE_SUPABASE_URL'],
    ['VITE_SUPABASE_URL que no es una URL', { viteSupabaseUrl: 'no es una url' }, 'VITE_SUPABASE_URL'],
    ['anon key de staging', { anonKey: jwt({ ref: STAGING, role: 'anon' }) }, 'otro proyecto'],
    ['service_role en lugar de anon', { anonKey: jwt({ ref: REF, role: 'service_role' }) }, 'no es la clave anon'],
    ['anon key vacía', { anonKey: undefined }, 'no es un JWT'],
    ['anon key que no es un JWT', { anonKey: 'sb_publishable_algo' }, 'no es un JWT'],
    ['anon key con la carga rota', { anonKey: 'a.%%%.c' }, 'no es un JWT'],
  ])('bloquea el frontend: %s', (_n, cambio, motivo) => {
    const problemas = comprobarGuarda({ ...bien, ...cambio });
    expect(
      problemas.some((p) => p.includes(motivo)),
      problemas.join('; '),
    ).toBe(true);
  });

  it('una SUPABASE_URL que no es una URL se avisa, no revienta', () => {
    expect(comprobarGuarda({ ...bien, supabaseUrl: 'xx' })).toContain(
      'SUPABASE_URL no es el proyecto de SUPABASE_PROJECT_REF',
    );
  });

  it('deploy-prod.yml pasa a la guarda las mismas variables con las que construye', () => {
    const guarda = flujoReal.slice(flujoReal.indexOf('- name: Guarda de seguridad')).split(/\n\s{6}- /)[0]!;
    expect(guarda).toContain('VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}');
    expect(guarda).toContain('VITE_SUPABASE_ANON_KEY: ${{ vars.VITE_SUPABASE_ANON_KEY }}');
    expect(flujoReal.indexOf('- name: Guarda de seguridad')).toBeLessThan(flujoReal.indexOf('npm run migrar'));
  });
});
