// docs/40 RV-532: al reponer el acceso tras restaurar, primero vuelven los tokens vigentes y después se revoca el
// resto. Al revés, el disparador de la revocación (0050) borraba en medio las suscripciones de los móviles cuyo token
// válido es posterior al volcado.

import { describe, expect, it } from 'vitest';
import { sqlReponerAccesoCuerpo } from './acceso-restaurado.ts';

describe('sqlReponerAccesoCuerpo', () => {
  const sql = sqlReponerAccesoCuerpo({
    config: null,
    dispositivos: JSON.stringify([
      {
        dispositivo_id: '00000000-0000-4000-8000-000000000001',
        token_hash: 'h1',
        emitido_en: '2026-10-01T00:00:00Z',
        ultimo_uso: '2026-10-15T00:00:00Z',
        revocado_en: null,
      },
    ]),
    administradores: null,
  });

  it('inserta los tokens vigentes antes de revocar los demás', () => {
    const insertar = sql.indexOf('insert into hidrantes.dispositivos');
    const revocar = sql.indexOf('update hidrantes.dispositivos d set revocado_en = now()');
    expect(insertar).toBeGreaterThan(-1);
    expect(revocar).toBeGreaterThan(-1);
    expect(insertar).toBeLessThan(revocar);
  });
});
