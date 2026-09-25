import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { comprobarGuarda } from './guarda-produccion.ts';

const REF = 'abcdefghijklmnopqrst';
const flujoReal = readFileSync(path.resolve(import.meta.dirname, '../.github/workflows/deploy-prod.yml'), 'utf8');
const bien = {
  entorno: 'produccion',
  proyectoPages: 'hidrantes-albolote',
  ref: REF,
  supabaseUrl: `https://${REF}.supabase.co`,
  dbUrl: `postgresql://hidrantes_migrador.${REF}:x@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
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
});
