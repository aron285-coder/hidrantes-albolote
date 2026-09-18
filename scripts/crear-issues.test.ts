import { describe, expect, it } from 'vitest';
import { cuerpoDe, leerTareas, tituloDe } from './crear-issues.ts';

describe('leerTareas (docs/09 real)', () => {
  const tareas = leerTareas();

  it('lee tareas de las fases 1 a 9 y ninguna de la 0', () => {
    const fases = new Set(tareas.map((t) => t.fase));
    expect([...fases].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('los títulos son únicos y cortos', () => {
    const titulos = tareas.map((t) => t.titulo);
    expect(new Set(titulos).size).toBe(titulos.length);
    for (const t of titulos) expect(t.length).toBeLessThanOrEqual(100);
  });

  it('cada tarea lleva objetivo y criterio de salida de su fase', () => {
    for (const t of tareas) {
      expect(t.objetivo, t.titulo).not.toBe('');
      expect(t.criterioSalida, t.titulo).not.toBe('');
    }
  });

  it('el cuerpo tiene las secciones del task-shaper', () => {
    const cuerpo = cuerpoDe(tareas[0]);
    for (const s of [
      '## Por qué',
      '## Qué',
      '## Fuera de alcance',
      '## Cómo verificar',
      '## Criterios de aceptación',
      '**Esfuerzo:**',
    ]) {
      expect(cuerpo).toContain(s);
    }
  });
});

describe('tituloDe', () => {
  it('corta en los dos puntos y quita markdown', () => {
    expect(tituloDe('`scripts/generar-zona.ts` (`npm run zona`): consulta Overpass')).toBe('scripts/generar-zona.ts');
  });
});
