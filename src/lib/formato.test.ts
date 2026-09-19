import { describe, expect, it } from 'vitest';
import { distancia, hace } from './formato';

describe('formato (UI-12)', () => {
  const ahora = new Date('2026-09-19T12:00:00Z');
  const menos = (ms: number) => new Date(ahora.getTime() - ms);

  it('tiempos relativos', () => {
    expect(hace(menos(20_000), ahora)).toBe('hace un momento');
    expect(hace(menos(5 * 60_000), ahora)).toBe('hace 5 min');
    expect(hace(menos(3 * 3600_000), ahora)).toBe('hace 3 h');
    expect(hace(menos(30 * 3600_000), ahora)).toBe('hace 1 día');
    expect(hace(menos(50 * 3600_000), ahora)).toBe('hace 2 días');
  });

  it('metros hasta 999, después km con un decimal y coma', () => {
    expect(distancia(12.4)).toBe('12 m');
    expect(distancia(999)).toBe('999 m');
    expect(distancia(1250)).toBe('1,3 km');
  });
});
