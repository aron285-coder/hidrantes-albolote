import { describe, expect, it } from 'vitest';
import { AMBITOS_USUARIO, MAX_CARACTERES, limpiar, novedadesDe } from './generar-novedades.ts';

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
    // mantenimiento y capturas no son ámbitos de cara al voluntario (RV-47): se completa con la
    // corrección de la cola.
    expect(n.lineas).toEqual([
      'El mapa avisa si falta el mapa base',
      'El estado regular pasa a naranja',
      'Lo encolado durante un envío sale en la misma vuelta',
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

  // docs/18 RV-47, DEC-091: solo lo que cambia para un voluntario.
  it('excluye ámbitos no listados', () => {
    const c = `## [1.0.0](x) (2026-10-01)\n\n### Novedades\n\n* **ci:** despliegue más rápido\n* **mapa:** capa nueva\n* sin ámbito\n`;
    expect(novedadesDe(c).lineas).toEqual(['Capa nueva']);
    expect(AMBITOS_USUARIO.has('mapa')).toBe(true);
    expect(AMBITOS_USUARIO.has('ci')).toBe(false);
  });

  it('excluye líneas con rutas o códigos internos', () => {
    const c = [
      '## [1.0.0](x) (2026-10-01)',
      '',
      '### Novedades',
      '',
      '* **mapa:** scripts/capturas.ts deja las pantallas listas',
      '* **panel:** el panel cumple RV-12 del todo',
      '* **ajustes:** vite.config.ts precachea más',
      '* **lista:** ordenar por calle',
    ].join('\n');
    expect(novedadesDe(c).lineas).toEqual(['Ordenar por calle']);
  });

  it('corta a 140', () => {
    const larga = 'a'.repeat(300);
    const c = `## [1.0.0](x) (2026-10-01)\n\n### Novedades\n\n* **mapa:** ${larga}\n`;
    const [l] = novedadesDe(c).lineas;
    expect(l!.length).toBeLessThanOrEqual(MAX_CARACTERES);
    expect(MAX_CARACTERES).toBe(140);
  });

  it('sin entradas válidas, lineas vacía', () => {
    const c = `## [1.0.0](x) (2026-10-01)\n\n### Novedades\n\n* **ci:** algo interno\n`;
    expect(novedadesDe(c)).toEqual({ version: '1.0.0', fecha: '2026-10-01', lineas: [] });
  });

  it('una línea sin ámbito ni enlaces queda igual, con mayúscula', () => {
    expect(limpiar('acercar hasta z21')).toBe('Acercar hasta z21');
    expect(limpiar('**app:** botón propio para instalar (DEC-064, F4.2)')).toBe('Botón propio para instalar');
  });
});
