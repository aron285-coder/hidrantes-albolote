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
};

describe('guarda de producción', () => {
  it('deja pasar la configuración correcta y el deploy-prod.yml real', () => {
    expect(comprobarGuarda(bien)).toEqual([]);
  });

  it.each([
    ['entorno de staging', { entorno: 'staging' }],
    ['proyecto de Pages de staging', { proyectoPages: 'hidrantes-albolote-staging' }],
    ['URL de otro proyecto', { supabaseUrl: 'https://zzzzzzzzzzzzzzzzzzzz.supabase.co' }],
    ['conexión como postgres', { dbUrl: `postgresql://postgres.${REF}:x@h:5432/postgres` }],
    ['flujo que carga el seed', { flujo: 'run: psql -f supabase/seed-staging.sql' }],
  ])('bloquea: %s', (_n, cambio) => {
    expect(comprobarGuarda({ ...bien, ...cambio }).length).toBeGreaterThan(0);
  });
});
