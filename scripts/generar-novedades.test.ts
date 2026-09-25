import { describe, expect, it } from 'vitest';
import { AMBITOS_USUARIO, MAX_CARACTERES, MAX_POR_AMBITO, limpiar, novedadesDe } from './generar-novedades.ts';

/** Solo los textos, para los tests que no miran la versión de cada línea. */
const textos = (changelog: string) => novedadesDe(changelog).lineas.map((l) => l.texto);

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
    // Versión a versión (docs/23 RV-95): la novedad y la corrección de la 0.5.0, y luego la 0.1.0
    // (mantenimiento y capturas no son ámbitos de cara al voluntario, RV-47).
    expect(n.lineas).toEqual([
      { version: '0.5.0', texto: 'El mapa avisa si falta el mapa base' },
      { version: '0.5.0', texto: 'Lo encolado durante un envío sale en la misma vuelta' },
      { version: '0.1.0', texto: 'El estado regular pasa a naranja' },
    ]);
    for (const l of n.lineas) {
      expect(l.texto).not.toMatch(/\*\*|\]\(|\(F\d|DEC-|#\d/);
    }
  });

  it('dentro de una versión, primero las novedades y luego las correcciones', () => {
    const solo = MUESTRA.split('## [0.4.0]')[0]!;
    expect(textos(solo)).toEqual([
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
    expect(textos(c)).toEqual(['Capa nueva']);
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
    expect(textos(c)).toEqual(['Ordenar por calle']);
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
    expect(textos(c)).toEqual(['Ordenar por calle']);
  });

  it('corta a 140', () => {
    const larga = 'a'.repeat(300);
    const c = `## [1.0.0](x) (2026-10-01)\n\n### Novedades\n\n* **mapa:** ${larga}\n`;
    const [l] = textos(c);
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
    expect(textos(changelog('**busqueda:** calles, lugares, direcciones y coordenadas (GM-04)'))).toEqual([
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
    expect(n.lineas).toEqual([{ version: '0.6.3', texto: 'El mapa se ve sin cobertura' }]);
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
      expect(textos(changelog(`**mapa:** algo con ${termino} dentro`)), termino).toEqual([]);
    }
    expect(textos(changelog('**mapa:** lo pide GM-04 ahora'))).toEqual([]);
  });

  it('las palabras normales que contienen esas letras no se descartan', () => {
    expect(
      textos(changelog('**mapa:** el precio de la ruta y la prueba de la capa', '**ficha:** HID-0012 abre su ficha')),
    ).toEqual(['El precio de la ruta y la prueba de la capa', 'HID-0012 abre su ficha']);
  });
});

// docs/23 RV-95: con la 0.6.4 en producción, Ajustes enseñaba «0.6.4 · Calles, lugares…», que era de
// la 0.6.0, y ninguna de las correcciones de la 0.6.4.
describe('lo último de cada versión, con su número (RV-95)', () => {
  const entrada = (ambito: string, texto: string, n: number) =>
    `* **${ambito}:** ${texto} ([#${n}](https://github.com/o/r/issues/${n})) ([abc${n}](https://github.com/o/r/commit/abc${n}))`;

  it('el caso de la 0.6.4: tres líneas de la 0.6.4 y ninguna de la 0.6.0', () => {
    const c = [
      '# Changelog',
      '',
      '## [0.6.4](https://github.com/o/r/compare/v0.6.3...v0.6.4) (2026-09-25)',
      '',
      '### Correcciones',
      '',
      entrada('avisos', 'activar los avisos dice qué ha fallado y cómo arreglarlo', 376),
      entrada('avisos', 'los avisos se activan de verdad y ya no se pierden por un fallo pasajero', 368),
      entrada('avisos', 'tocar un aviso lleva siempre a «Mis propuestas»', 383),
      entrada('mapa', 'en el ordenador el mapa cabe en la pantalla y sus botones de abajo se ven', 385),
      entrada('mapa', 'los botones del mapa van pegados al borde y «Cercanos» abajo, al alcance del pulgar', 381),
      entrada('panel', 'Salud del sistema dice si las tareas son de ahora mismo o de la vigilancia', 387),
      entrada('panel', 'Salud del sistema enseña las tareas programadas de ahora mismo', 375),
      '',
      '## [0.6.0](https://github.com/o/r/compare/v0.5.0...v0.6.0) (2026-09-24)',
      '',
      '### Novedades',
      '',
      entrada('busqueda', 'calles, lugares, direcciones y coordenadas (GM-04)', 266),
      entrada('mapa', 'los cinco puntos más cercanos que funcionan', 270),
      entrada('mapa', 'mantener pulsado el mapa abre "¿Qué hay aquí?"', 280),
      '',
    ].join('\n');
    const n = novedadesDe(c);
    expect(n.version).toBe('0.6.4');
    expect(n.lineas).toHaveLength(3);
    for (const l of n.lineas) expect(l.version).toBe('0.6.4');
    expect(n.lineas.map((l) => l.texto)).toEqual([
      'Activar los avisos dice qué ha fallado y cómo arreglarlo',
      'Los avisos se activan de verdad y ya no se pierden por un fallo pasajero',
      'En el ordenador el mapa cabe en la pantalla y sus botones de abajo se ven',
    ]);
  });

  it('una novedad y una corrección de la última, y una de la anterior, cada una con su número', () => {
    const c = [
      '## [1.1.0](x) (2026-10-02)',
      '',
      '### Novedades',
      '',
      entrada('lista', 'ordenar por calle', 1),
      '',
      '### Correcciones',
      '',
      entrada('ficha', 'la ficha se cierra al volver atrás', 2),
      '',
      '## [1.0.0](x) (2026-10-01)',
      '',
      '### Novedades',
      '',
      entrada('mapa', 'capa de satélite', 3),
      entrada('alta', 'alta con la posición del móvil', 4),
      '',
    ].join('\n');
    expect(novedadesDe(c).lineas).toEqual([
      { version: '1.1.0', texto: 'Ordenar por calle' },
      { version: '1.1.0', texto: 'La ficha se cierra al volver atrás' },
      { version: '1.0.0', texto: 'Capa de satélite' },
    ]);
  });

  it('como mucho dos líneas por ámbito en una versión: la tercera viene de otro ámbito', () => {
    expect(MAX_POR_AMBITO).toBe(2);
    const c = [
      '## [1.1.0](x) (2026-10-02)',
      '',
      '### Correcciones',
      '',
      entrada('panel', 'Salud del sistema dice de cuándo son las tareas', 1),
      entrada('panel', 'Salud del sistema enseña las tareas de ahora mismo', 2),
      entrada('panel', 'Salud del sistema marca la vigilancia atrasada', 3),
      entrada('lista', 'la lista recuerda el filtro', 4),
      '',
    ].join('\n');
    expect(textos(c)).toEqual([
      'Salud del sistema dice de cuándo son las tareas',
      'Salud del sistema enseña las tareas de ahora mismo',
      'La lista recuerda el filtro',
    ]);
  });

  it('el límite por ámbito es de cada versión: la anterior puede traer el mismo ámbito', () => {
    const c = [
      '## [1.1.0](x) (2026-10-02)',
      '',
      '### Correcciones',
      '',
      entrada('panel', 'una', 1),
      entrada('panel', 'dos', 2),
      entrada('panel', 'tres', 3),
      '',
      '## [1.0.0](x) (2026-10-01)',
      '',
      '### Correcciones',
      '',
      entrada('panel', 'cuatro', 4),
      '',
    ].join('\n');
    expect(novedadesDe(c).lineas).toEqual([
      { version: '1.1.0', texto: 'Una' },
      { version: '1.1.0', texto: 'Dos' },
      { version: '1.0.0', texto: 'Cuatro' },
    ]);
  });

  it('una línea repetida en otra versión sale una sola vez, con el número más reciente', () => {
    const c = [
      '## [1.1.0](x) (2026-10-02)',
      '',
      '### Correcciones',
      '',
      entrada('mapa', 'capa de satélite', 1),
      '',
      '## [1.0.0](x) (2026-10-01)',
      '',
      '### Novedades',
      '',
      entrada('mapa', 'capa de satélite', 2),
      '',
    ].join('\n');
    expect(novedadesDe(c).lineas).toEqual([{ version: '1.1.0', texto: 'Capa de satélite' }]);
  });
});
