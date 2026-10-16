// docs/39 RV-524 (DEC-223): la app de staging se llama «Hidrantes test»; producción y local, «Hidrantes».

import { describe, expect, it } from 'vitest';
import { nombreCortoDe, tituloPanelDe } from './nombre-app';

describe('el nombre de la app por entorno', () => {
  it('staging: «Hidrantes test»', () => {
    expect(nombreCortoDe('staging')).toBe('Hidrantes test');
    expect(tituloPanelDe('staging')).toBe('Hidrantes test · Panel de jefatura');
  });

  it('producción y local: «Hidrantes»', () => {
    for (const e of ['produccion', 'local'] as const) {
      expect(nombreCortoDe(e)).toBe('Hidrantes');
      expect(tituloPanelDe(e)).toBe('Hidrantes Albolote · Panel de jefatura');
    }
  });
});
