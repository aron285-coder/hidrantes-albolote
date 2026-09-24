import { describe, expect, it } from 'vitest';
import { FIRMA, indice, nombreArchivo, nombresAjenos, vocabularioInterfaz } from './capturas.ts';

describe('nombre de archivo', () => {
  it('va numerado para que los manuales puedan citarlo', () => {
    expect(nombreArchivo(1, 'entrada', false)).toBe('01-entrada.png');
    expect(nombreArchivo(10, 'ajustes', false)).toBe('10-ajustes.png');
  });

  it('el modo oscuro no pisa las del modo claro', () => {
    expect(nombreArchivo(5, 'mapa', true)).toBe('05-mapa-oscuro.png');
  });
});

describe('nombres que no pueden acabar en una captura pública (FR-27, DEC-053)', () => {
  const vocabulario = vocabularioInterfaz();

  it('el vocabulario sale de los textos de la interfaz', () => {
    expect(vocabulario.has('Ajustes')).toBe(true);
    expect(vocabulario.has('propuestas')).toBe(true);
    expect(vocabulario.has('Fernández')).toBe(false);
  });

  it('caza un nombre y un apellido de verdad', () => {
    expect(nombresAjenos('Propuesta de Lucía Fernández', { vocabulario })).toEqual(['Lucía Fernández']);
  });

  it('deja en paz lo que dice la propia aplicación', () => {
    const pantalla = ['Mis propuestas', 'Aviso legal y privacidad', 'Nuevo punto', 'Sin cobertura'].join('\n');
    expect(nombresAjenos(pantalla, { vocabulario })).toEqual([]);
  });

  it('la firma que escribe el propio script no cuenta', () => {
    expect(nombresAjenos(`${FIRMA.nombre} ${FIRMA.apellido}`, { vocabulario })).toEqual([]);
  });

  it('dos palabras en líneas distintas no son un nombre', () => {
    expect(nombresAjenos('Ajustes\nVoluntaria', { vocabulario })).toEqual([]);
  });

  it('no repite el mismo nombre aunque salga varias veces', () => {
    expect(nombresAjenos('Lucía Fernández\ny otra vez Lucía Fernández', { vocabulario })).toEqual(['Lucía Fernández']);
  });
});

describe('LEEME de la carpeta', () => {
  const md = indice(
    [{ archivo: '01-entrada.png', que: 'La entrada' }],
    'https://hidrantes-albolote-staging.pages.dev',
    new Date('2026-09-21T10:00:00Z'),
  );

  it('dice de dónde y de cuándo salieron, que es lo que se olvida', () => {
    expect(md).toContain('2026-09-21');
    expect(md).toContain('hidrantes-albolote-staging.pages.dev');
  });

  it('lista cada archivo con lo que enseña', () => {
    expect(md).toContain('| `01-entrada.png` | La entrada |');
  });
});
