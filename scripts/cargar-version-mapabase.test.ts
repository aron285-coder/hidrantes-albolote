import { describe, expect, it } from 'vitest';
import { sqlVersionCallejero, sqlVersionMapabase } from './cargar-version-mapabase.ts';
import { ErrorDeScript } from './lib/comun.ts';

describe('versión del mapa base en config (RV-21, FR-143)', () => {
  it('upsert de version_mapabase con la del JSON, anotado como del despliegue', () => {
    const sql = sqlVersionMapabase({ version: '20260919' });
    expect(sql).toContain("('version_mapabase', to_jsonb('20260919'::text), 'despliegue')");
    expect(sql).toContain('on conflict (clave) do update set valor = excluded.valor');
  });
  it('escapa comillas', () => {
    expect(sqlVersionMapabase({ version: "2026'09" })).toContain("to_jsonb('2026''09'::text)");
  });
  it('sin versión no escribe nada', () => {
    expect(() => sqlVersionMapabase({ version: '' })).toThrow(ErrorDeScript);
    expect(() => sqlVersionCallejero({ version: '' })).toThrow(ErrorDeScript);
  });
  it('también la del callejero (docs/18 GM-04)', () => {
    expect(sqlVersionCallejero({ version: '20260923' })).toContain(
      "('version_callejero', to_jsonb('20260923'::text), 'despliegue')",
    );
  });
});
