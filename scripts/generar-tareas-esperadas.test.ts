// docs/19 RV-56: la lista de tareas de pg_cron que tiene que haber, al día con las migraciones.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARCHIVO, contenido, leerMigraciones, tareasEsperadas } from './generar-tareas-esperadas.ts';

describe('tareas esperadas de pg_cron (RV-56)', () => {
  it('scripts/sql/tareas-esperadas.txt coincide con las migraciones (si no: npm run tareas-esperadas)', () => {
    expect(readFileSync(ARCHIVO, 'utf8').replace(/\r\n/g, '\n')).toBe(contenido(tareasEsperadas(leerMigraciones())));
  });

  it('hay tareas y todas son hidrantes_*', () => {
    const tareas = tareasEsperadas(leerMigraciones());
    expect(tareas.length).toBeGreaterThanOrEqual(7);
    for (const t of tareas) expect(t).toMatch(/^hidrantes_[a-z_]+$/);
  });

  it('una migración posterior con cron.unschedule la quita; las de otras apps no cuentan', () => {
    expect(
      tareasEsperadas([
        { nombre: '0002_b.sql', sql: "select cron.unschedule('hidrantes_a');" },
        {
          nombre: '0001_a.sql',
          sql: "select cron.schedule('hidrantes_a', '* * * * *', $$x$$);\nselect cron.schedule( 'hidrantes_b', '1 * * * *', $$y$$);\nselect cron.schedule('uniformidad_c', '* * * * *', $$z$$);",
        },
      ]),
    ).toEqual(['hidrantes_b']);
  });
});
