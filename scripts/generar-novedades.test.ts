import { describe, expect, it } from 'vitest';
import { limpiar, novedadesDe } from './generar-novedades.ts';

const MUESTRA = `# Changelog

## [0.5.0](https://github.com/o/r/compare/v0.4.0...v0.5.0) (2026-09-24)


### Novedades

* **mapa:** el mapa avisa si falta el mapa base ([#199](https://github.com/o/r/issues/199)) ([abc1234](https://github.com/o/r/commit/abc1234))


### Correcciones

* **cola:** lo encolado durante un envío sale en la misma vuelta (RV-01) ([#191](https://github.com/o/r/issues/191)) ([def5678](https://github.com/o/r/commit/def5678))

## [0.4.0](https://github.com/o/r/compare/v0.3.0...v0.4.0) (2026-09-22)


### Novedades

* **mantenimiento:** purgar las fotos huerfanas desde Ajustes y cada lunes ([#156](https://github.com/o/r/issues/156)) ([2cbbde4](https://github.com/o/r/commit/2cbbde4))

## 0.1.0 (2026-09-21)


### Novedades

* **capturas:** scripts/capturas.ts deja las pantallas listas (F9.7) ([#145](https://github.com/o/r/issues/145)) ([80a6726](https://github.com/o/r/commit/80a6726))
* **diseño:** el estado regular pasa a naranja (DEC-076) ([#141](https://github.com/o/r/issues/141))
`;

describe('novedades desde el CHANGELOG (RV-20, FR-167)', () => {
  it('tres líneas limpias, sin negritas, sin enlaces y sin identificadores técnicos', () => {
    const n = novedadesDe(MUESTRA);
    expect(n.version).toBe('0.5.0');
    expect(n.fecha).toBe('2026-09-24');
    expect(n.lineas).toEqual([
      'El mapa avisa si falta el mapa base',
      'Purgar las fotos huerfanas desde Ajustes y cada lunes',
      'Scripts/capturas.ts deja las pantallas listas',
    ]);
    for (const l of n.lineas) {
      expect(l).not.toMatch(/\*\*|\]\(|\(F\d|DEC-|#\d/);
    }
  });

  it('completa con correcciones si faltan novedades', () => {
    const solo = MUESTRA.split('## [0.4.0]')[0]!;
    expect(novedadesDe(solo).lineas).toEqual([
      'El mapa avisa si falta el mapa base',
      'Lo encolado durante un envío sale en la misma vuelta',
    ]);
  });

  it('CHANGELOG vacío → lineas: []', () => {
    expect(novedadesDe('# Changelog\n')).toEqual({ version: null, fecha: null, lineas: [] });
  });

  it('una línea sin ámbito ni enlaces queda igual, con mayúscula', () => {
    expect(limpiar('acercar hasta z21')).toBe('Acercar hasta z21');
    expect(limpiar('**app:** botón propio para instalar (DEC-064, F4.2)')).toBe('Botón propio para instalar');
  });
});
