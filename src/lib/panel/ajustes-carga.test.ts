// docs/32 RV-257 y RV-261: Ajustes no inventa datos cuando no han podido cargar.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const respuesta = vi.hoisted(() => ({ valor: { ok: true, datos: [] } as unknown }));
vi.mock('./consultas', () => ({
  leerLista: async () => respuesta.valor,
  leer: async () => respuesta.valor,
  funcion: async () => respuesta.valor,
}));

const { PARAMETROS_POR_DEFECTO, avisoPedido, cambiosParametros, contarDispositivos } = await import('./ajustes');
const { T } = await import('../textos');

beforeEach(() => {
  respuesta.valor = { ok: true, datos: [] };
});

describe('contarDispositivos (docs/32 RV-261)', () => {
  it('cuenta los móviles con acceso', async () => {
    respuesta.valor = { ok: true, datos: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
    expect(await contarDispositivos()).toEqual({ ok: true, datos: 3 });
  });

  it('si no puede leerlos, devuelve el error y no un 0', async () => {
    respuesta.valor = { ok: false, codigo: 'SIN_SERVIDOR' };
    expect(await contarDispositivos()).toEqual({ ok: false, codigo: 'SIN_SERVIDOR' });
  });
});

describe('aviso al pedir mantenimiento (docs/32 RV-260)', () => {
  it('en staging dice que queda anotado; si no, que empezará en unos minutos', () => {
    expect(avisoPedido('Regenerar zona', { pedido: true, staging: true })).toBe(
      T.panelAjustes.trabajoAnotadoStaging('Regenerar zona'),
    );
    expect(avisoPedido('Regenerar zona', { pedido: true })).toBe(T.panelAjustes.trabajoPedido('Regenerar zona'));
    expect(avisoPedido('Regenerar zona', null)).toBe(T.panelAjustes.trabajoPedido('Regenerar zona'));
  });
});

describe('cambiosParametros sin cargar (docs/32 RV-257)', () => {
  it('sin lo guardado de verdad no hay cambios que mandar, tampoco los valores por defecto', () => {
    const editado = { ...PARAMETROS_POR_DEFECTO, meses_revision: 18 };
    expect(cambiosParametros(null, editado)).toEqual({});
    expect(cambiosParametros(null, PARAMETROS_POR_DEFECTO)).toEqual({});
  });

  it('con lo cargado, compara con eso y no con los valores por defecto', () => {
    const cargado = { ...PARAMETROS_POR_DEFECTO, meses_revision: 6, dias_papelera: 45 };
    expect(cambiosParametros(cargado, { ...cargado, meses_revision: 18 })).toEqual({ meses_revision: 18 });
  });
});
