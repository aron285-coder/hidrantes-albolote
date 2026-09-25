import { describe, expect, it } from 'vitest';
import { hayNovedadesSinVer, normalizarNovedades } from './novedades';

// docs/23 RV-95, DEC-142: "Nuevo" y el punto de la pestaña, solo si la última versión trae algo suyo.
describe('novedades sin ver (FR-167, RV-95)', () => {
  const con = (version: string, ...versiones: string[]) => ({
    version,
    fecha: '2026-09-25',
    lineas: versiones.map((v, i) => ({ version: v, texto: `línea ${i}` })),
  });

  it('una versión nueva con líneas propias se marca', () => {
    expect(hayNovedadesSinVer(con('0.6.4', '0.6.4', '0.6.3'))).toBe(true);
  });

  it('una versión que solo trajo cambios internos no se marca: sus líneas son de antes', () => {
    expect(hayNovedadesSinVer(con('0.6.5', '0.6.4', '0.6.4', '0.6.3'))).toBe(false);
  });

  it('sin versión o sin líneas, nada que marcar', () => {
    expect(hayNovedadesSinVer(con('0.6.4'))).toBe(false);
    expect(hayNovedadesSinVer({ version: null, fecha: null, lineas: [] })).toBe(false);
  });

  it('el formato antiguo cuenta como de la versión de arriba', () => {
    expect(hayNovedadesSinVer(normalizarNovedades({ version: '0.6.2', fecha: null, lineas: ['Cercanos'] }))).toBe(true);
  });

  it('una línea sin versión o sin texto no se enseña', () => {
    expect(
      normalizarNovedades({
        version: '0.6.4',
        fecha: null,
        lineas: [{ version: '', texto: 'x' }, { version: '0.6.4', texto: '' }, ''],
      }).lineas,
    ).toEqual([]);
  });
});
