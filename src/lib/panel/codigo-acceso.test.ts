// docs/35 RV-433 (DEC-201): lo que se envía al cambiar el código de acceso.

import { describe, expect, it, vi } from 'vitest';

const rpc = vi.fn(async () => ({ ok: true, datos: null }));
vi.mock('../api', async (original) => ({ ...(await original<typeof import('../api')>()), rpc }));

const { cambiarCodigo } = await import('./ajustes');
const { textoError } = await import('./errores');
const { T } = await import('../textos');

describe('cambiarCodigo (docs/35 RV-433)', () => {
  it('sin revocar, la entrada no se abre aunque se pida', async () => {
    await cambiarCodigo('123456', false, true);
    expect(rpc).toHaveBeenLastCalledWith('fn_cambiar_codigo_acceso', {
      nuevo: '123456',
      revocar_dispositivos: false,
      abrir_entrada: false,
    });
  });

  it('revocando, solo se abre si se pide; por defecto, no', async () => {
    await cambiarCodigo('123456', true);
    expect(rpc).toHaveBeenLastCalledWith('fn_cambiar_codigo_acceso', {
      nuevo: '123456',
      revocar_dispositivos: true,
      abrir_entrada: false,
    });
    await cambiarCodigo('123456', true, true);
    expect(rpc).toHaveBeenLastCalledWith('fn_cambiar_codigo_acceso', {
      nuevo: '123456',
      revocar_dispositivos: true,
      abrir_entrada: true,
    });
  });
});

it('una hora fuera del margen, según el servidor, se dice con palabras (docs/35 RV-433)', () => {
  expect(textoError('PAYLOAD_INVALIDO(desde)')).toBe(T.panelAjustes.desdeFueraDeRango);
});
