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

  // docs/19 RV-68: el filtro va antes del corte; si no, una ruta más allá del carácter 140 se colaba.
  it('una ruta o un código después del carácter 140 también excluye la línea', () => {
    const relleno = 'la ficha enseña mejor el estado del punto y la fecha de su última revisión '.repeat(2);
    const c = [
      '## [1.0.0](x) (2026-10-01)',
      '',
      '### Novedades',
      '',
      `* **mapa:** ${relleno}con src/lib/ficha.ts`,
      `* **mapa:** ${relleno}como pedía RV-12`,
      '* **lista:** ordenar por calle',
    ].join('\n');
    expect(relleno.length).toBeGreaterThan(140);
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

// docs/20 RV-77: en Ajustes salieron «(GM-04)» y «desde un Worker de Cloudflare».
describe('códigos de cualquier serie y términos técnicos (RV-77)', () => {
  const changelog = (...lineas: string[]) =>
    `## [0.6.3](https://github.com/o/r/compare/v0.6.2...v0.6.3) (2026-09-24)\n\n### Novedades\n\n${lineas.map((l) => `* ${l}`).join('\n')}\n`;

  it('(GM-04) desaparece y la línea se queda', () => {
    expect(limpiar('**busqueda:** calles, lugares, direcciones y coordenadas (GM-04) ([#266](https://x))')).toBe(
      'Calles, lugares, direcciones y coordenadas',
    );
    expect(novedadesDe(changelog('**busqueda:** calles, lugares, direcciones y coordenadas (GM-04)')).lineas).toEqual([
      'Calles, lugares, direcciones y coordenadas',
    ]);
  });

  it('un código inventado (XY-12) también desaparece, y varios juntos', () => {
    expect(limpiar('**mapa:** algo nuevo (XY-12)')).toBe('Algo nuevo');
    expect(limpiar('**mapa:** algo nuevo (RV-52, DEC-100; F9.10)')).toBe('Algo nuevo');
  });

  it('"…desde un Worker de Cloudflare" se descarta', () => {
    const n = novedadesDe(
      changelog(
        '**avisos:** avisos cada 5 minutos desde un Worker de Cloudflare (RV-52)',
        '**mapa:** el mapa se ve sin cobertura',
      ),
    );
    expect(n.lineas).toEqual(['El mapa se ve sin cobertura']);
  });

  it('se descarta cualquier término de la lista, y un código suelto fuera de paréntesis', () => {
    for (const termino of [
      'Supabase',
      'el CI',
      'un workflow',
      'el token',
      'el build',
      'un PR',
      'la migración',
      'pgTAP',
      'los e2e',
      'Playwright',
    ]) {
      expect(novedadesDe(changelog(`**mapa:** algo con ${termino} dentro`)).lineas, termino).toEqual([]);
    }
    expect(novedadesDe(changelog('**mapa:** lo pide GM-04 ahora')).lineas).toEqual([]);
  });

  it('las palabras normales que contienen esas letras no se descartan', () => {
    expect(
      novedadesDe(
        changelog('**mapa:** el precio de la ruta y la prueba de la capa', '**ficha:** HID-0012 abre su ficha'),
      ).lineas,
    ).toEqual(['El precio de la ruta y la prueba de la capa', 'HID-0012 abre su ficha']);
  });
});
