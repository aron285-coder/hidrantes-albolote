import { describe, expect, it } from 'vitest';
import { anotarChecklist, denegado, resumen, type Resultado } from './intrusion.ts';

describe('denegado', () => {
  it('un error HTTP es una puerta cerrada', () => {
    expect(denegado({ estado: 401, cuerpo: { code: '42501' } })).toBe(true);
    expect(denegado({ estado: 403, cuerpo: { error: 'NO_AUTORIZADO' } })).toBe(true);
    expect(denegado({ estado: 404, cuerpo: { code: 'PGRST202' } })).toBe(true);
  });

  it('una lista vacía también: RLS deja pasar la consulta y no devuelve filas', () => {
    expect(denegado({ estado: 200, cuerpo: [] })).toBe(true);
  });

  it('una respuesta con datos NO lo es, que es de lo que avisa la prueba', () => {
    expect(denegado({ estado: 200, cuerpo: [{ id: 1 }] })).toBe(false);
    expect(denegado({ estado: 200, cuerpo: { token: 'abc' } })).toBe(false);
    expect(denegado({ estado: 201, cuerpo: '' })).toBe(false);
  });
});

describe('resumen', () => {
  it('lleva el código de Postgres y el mensaje, recortados', () => {
    expect(resumen({ estado: 401, cuerpo: { code: '42501', message: 'permission denied for table puntos' } })).toBe(
      '401 · 42501: permission denied for table puntos',
    );
  });

  it('el error de las Pages Functions viene en `error`', () => {
    expect(resumen({ estado: 403, cuerpo: { error: 'NO_AUTORIZADO' } })).toBe('403 · NO_AUTORIZADO');
  });

  it('una lista dice cuántas filas, que es lo que importa en las lecturas', () => {
    expect(resumen({ estado: 200, cuerpo: [] })).toBe('200, 0 filas');
    expect(resumen({ estado: 200, cuerpo: [{ id: 1 }, { id: 2 }] })).toBe('200, 2 filas');
  });

  it('sin cuerpo reconocible, al menos el estado', () => {
    expect(resumen({ estado: 500, cuerpo: '' })).toBe('500');
  });
});

describe('anotarChecklist', () => {
  const tabla = [
    '| # | Prueba | Esperado | Última ejecución | Resultado |',
    '|---|---|---|---|---|',
    '| 1 | `select` sobre `propuestas` | *permission denied* / 0 filas | | |',
    '| 2 | `select` sobre `registro` | ídem | 2020-01-01 | ❌ 200, 3 filas |',
    '',
    '| 9 | otra tabla cualquiera | no se toca | | |',
  ].join('\n');
  const resultados: Resultado[] = [
    { numero: 1, nombre: 'propuestas', pasa: true, observado: '401 · 42501' },
    { numero: 2, nombre: 'registro', pasa: false, observado: '200, 3 filas' },
  ];

  it('escribe fecha y resultado sin tocar el enunciado', () => {
    const salida = anotarChecklist(tabla, '2026-09-21', resultados).split('\n');
    expect(salida[2]).toBe(
      '| 1 | `select` sobre `propuestas` | *permission denied* / 0 filas | 2026-09-21 | ✅ 401 · 42501 |',
    );
    expect(salida[3]).toBe('| 2 | `select` sobre `registro` | ídem | 2026-09-21 | ❌ 200, 3 filas |');
  });

  it('deja en paz las filas que no son de la checklist', () => {
    expect(anotarChecklist(tabla, '2026-09-21', resultados)).toContain(
      '| 9 | otra tabla cualquiera | no se toca | | |',
    );
  });

  it('anotar dos veces no acumula columnas', () => {
    const una = anotarChecklist(tabla, '2026-09-21', resultados);
    expect(anotarChecklist(una, '2026-09-22', resultados)).toBe(anotarChecklist(tabla, '2026-09-22', resultados));
  });
});
