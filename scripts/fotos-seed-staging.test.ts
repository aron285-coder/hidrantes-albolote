import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUCKET_STAGING,
  URL_STAGING,
  comprobarStaging,
  estados,
  faltan,
  rotulo,
  rutasDelSeed,
  urlPublica,
} from './fotos-seed-staging.ts';
import { REFS } from './lib/comun.ts';

// docs/33 RV-340 (D12 del recorrido): staging con fotos que existen y sin las bocas duplicadas.
const raiz = path.resolve(import.meta.dirname, '..');
const leer = (r: string) => readFileSync(path.join(raiz, r), 'utf8');
const seed = leer('supabase/seed-staging.sql');

describe('fotos del seed de staging', () => {
  it('salen del propio seed: las 12 de los puntos y las 5 de las propuestas con foto', () => {
    const rutas = rutasDelSeed(seed);
    expect(rutas).toHaveLength(17);
    expect(rutas).toContain('fotos/prueba-hid-9001.jpg');
    expect(rutas).toContain('fotos/prueba-boc-9004.jpg');
    expect(rutas).toContain('fotos/prueba-propuesta-a6.jpg');
    expect(rutas.every((r) => /^fotos\/prueba-[a-z0-9-]+\.jpg$/.test(r))).toBe(true);
  });

  it('la URL pública es la del bucket de staging, con cada tramo codificado', () => {
    expect(BUCKET_STAGING).toBe('hidrantes-fotos-dev');
    expect(urlPublica(`${URL_STAGING}/`, BUCKET_STAGING, 'fotos/prueba-hid-9001.jpg')).toBe(
      `https://${REFS.staging}.supabase.co/storage/v1/object/public/hidrantes-fotos-dev/fotos/prueba-hid-9001.jpg`,
    );
    expect(urlPublica(URL_STAGING, 'b', 'fotos/a b.jpg')).toMatch(/\/b\/fotos\/a%20b\.jpg$/);
  });

  it('solo staging: con la URL de producción o cualquier otra, aborta', () => {
    expect(() => comprobarStaging(URL_STAGING)).not.toThrow();
    expect(() => comprobarStaging(`https://${REFS.prod}.supabase.co`)).toThrow(/solo van a staging/);
    expect(() => comprobarStaging('http://127.0.0.1:54321')).toThrow(/solo van a staging/);
    expect(() => comprobarStaging('no es una url')).toThrow(/no es una URL/);
  });

  it('cada foto lleva el código del punto o la propuesta', () => {
    expect(rotulo('fotos/prueba-hid-9001.jpg')).toBe('HID-9001');
    expect(rotulo('fotos/prueba-boc-9003.jpg')).toBe('BOC-9003');
    expect(rotulo('fotos/prueba-propuesta-a1.jpg')).toBe('Propuesta a1');
  });

  it('falta toda la que no responde 200, también la que no responde', async () => {
    const respuestas: Record<string, number | null> = { a: 200, b: 400, c: null };
    const pedir = (async (url: string) => {
      const s = respuestas[url.slice(-1)];
      if (s === null) throw new Error('sin red');
      return new Response('x', { status: s });
    }) as unknown as typeof fetch;
    const e = await estados('https://x.supabase.co', 'b', ['fotos/a', 'fotos/b', 'fotos/c'], pedir);
    expect([...e]).toEqual([
      ['fotos/a', 200],
      ['fotos/b', 400],
      ['fotos/c', 0],
    ]);
    expect(faltan(e)).toEqual(['fotos/b', 'fotos/c']);
  });
});

describe('deploy-staging sube y comprueba las fotos del seed', () => {
  const flujo = leer('.github/workflows/deploy-staging.yml');
  const paso = (nombre: string) => {
    const desde = flujo.indexOf(`- name: ${nombre}`);
    expect(desde, nombre).toBeGreaterThan(-1);
    return flujo.slice(desde).split(/\n {6}- /)[0]!;
  };

  it('después del seed y del navegador, con los secretos del environment staging', () => {
    const fotos = paso('Fotos del seed de staging (docs/33 RV-340)');
    expect(fotos).toContain('run: npm run fotos-seed');
    expect(fotos).toContain('SUPABASE_URL: ${{ secrets.SUPABASE_URL }}');
    expect(fotos).toContain('SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}');
    expect(fotos).toContain('SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}');
    const i = flujo.indexOf('- name: Fotos del seed de staging');
    expect(flujo.indexOf('- name: Seed de staging, idempotente')).toBeLessThan(i);
    expect(flujo.indexOf('uses: ./.github/actions/navegadores')).toBeLessThan(i);
    expect(flujo).toMatch(/environment:\n\s+name: staging/);
  });

  it('producción no lo nombra', () => {
    expect(leer('.github/workflows/deploy-prod.yml')).not.toMatch(/fotos-seed/);
  });
});

describe('el seed retira las cuatro bocas duplicadas de RV-139b', () => {
  const bloque = seed.slice(seed.indexOf('las cuatro bocas duplicadas de RV-139b'), seed.lastIndexOf('commit;'));

  it('con fn_retirar_punto, motivo «prueba», y claims de un administrador de prueba locales a la transacción', () => {
    expect(bloque).toContain("perform hidrantes.fn_retirar_punto(p.id, 'prueba')");
    expect(bloque).toMatch(/set_config\('request\.jwt\.claims',[\s\S]*'jefatura\.prueba@example\.com'[\s\S]*, true\)/);
    expect(bloque).toContain("'BOC-0003', 'BOC-0004', 'BOC-0005', 'BOC-0006'");
  });

  it('solo bocas activas, anteriores al 10 oct 2026 y con otra de las cuatro a menos de 15 m', () => {
    expect(bloque).toContain("x.situacion = 'activo'");
    expect(bloque).toContain("x.tipo = 'boca_riego'");
    expect(bloque).toContain("x.creado_en < '2026-10-10'");
    expect(bloque).toMatch(/st_dwithin\(x\.geom, y\.geom, 15\)/);
  });

  it('la CI lo prueba con las cuatro y una quinta en el mismo sitio, cargando el seed dos veces', () => {
    const ci = leer('.github/workflows/ci.yml');
    const desde = ci.indexOf('- name: El seed retira las bocas duplicadas de RV-139b (RV-340)');
    expect(desde).toBeGreaterThan(-1);
    const pasoCi = ci.slice(desde).split(/\n {6}- /)[0]!;
    expect(pasoCi).toContain('scripts/sql/probar-seed-duplicados.sql');
    expect(pasoCi).toMatch(/for i in 1 2; do[\s\S]*seed-staging\.sql/);
    expect(pasoCi).toContain('scripts/sql/verificar-seed-duplicados.sql');
    expect(leer('scripts/sql/probar-seed-duplicados.sql')).toContain('unnest(array[3, 4, 5, 6, 8])');
  });
});
