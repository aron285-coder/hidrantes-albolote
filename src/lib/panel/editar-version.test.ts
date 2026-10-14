// docs/36 RV-471 (DEC-208): Editar manda la versión del punto que se abrió y, si otro lo ha cambiado,
// «Ver lo nuevo» conserva lo escrito en lo que el otro no ha tocado.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Punto } from '../puntos';

const rpc = vi.fn();
vi.mock('../api', async (original) => ({ ...(await original<typeof import('../api')>()), rpc }));
const sincronizar = vi.fn(async () => ({ ok: true, datos: null }));
vi.mock('../puntos', async (original) => ({ ...(await original<typeof import('../puntos')>()), sincronizar }));

const { editarPunto, fusionarConNuevo, valoresDe } = await import('./inventario');

const BOCA: Punto = {
  id: 'b1',
  codigo: 'BOC-0001',
  tipo: 'boca_riego',
  diametro_mm: 45,
  caudal: 'bueno',
  racor: 'granada',
  descripcion_fallo: null,
  descripcion: null,
  direccion: 'Calle Real 3',
  foto_path: null,
  municipio: 'albolote',
  nucleo: 'Albolote',
  fecha_ultima_revision: '2026-09-01',
  actualizado_en: '2026-10-01T10:00:00Z',
  datos_cambiados_en: '2026-10-01T10:00:00.123456+00:00',
  lat: 37.23,
  lng: -3.65,
  radio_px: 8,
  revision_caducada: false,
};

beforeEach(() => {
  rpc.mockReset();
  sincronizar.mockClear();
});

describe('editarPunto con versión (RV-471)', () => {
  it('manda la versión que se abrió', async () => {
    rpc.mockResolvedValue({ ok: true, datos: null });
    await editarPunto(BOCA.id, { caudal: 'malo' }, BOCA.datos_cambiados_en);
    expect(rpc).toHaveBeenCalledWith('fn_editar_punto', {
      punto_id: BOCA.id,
      cambios: { caudal: 'malo' },
      version: BOCA.datos_cambiados_en,
    });
  });

  it('sin versión (un punto guardado antes de 0048), la llamada de siempre', async () => {
    rpc.mockResolvedValue({ ok: true, datos: null });
    await editarPunto(BOCA.id, { caudal: 'malo' });
    expect(rpc).toHaveBeenCalledWith('fn_editar_punto', { punto_id: BOCA.id, cambios: { caudal: 'malo' } });
  });

  it('PUNTO_CAMBIADO vuelve tal cual y no sincroniza', async () => {
    rpc.mockResolvedValue({ ok: false, codigo: 'PUNTO_CAMBIADO' });
    const r = await editarPunto(BOCA.id, { caudal: 'malo' }, BOCA.datos_cambiados_en);
    expect(r).toEqual({ ok: false, codigo: 'PUNTO_CAMBIADO' });
    expect(sincronizar).not.toHaveBeenCalled();
  });
});

describe('Ver lo nuevo: fusionarConNuevo (RV-471)', () => {
  // Lo escrito: estado Malo y una descripción.
  const escrito = { ...valoresDe(BOCA), caudal: 'malo' as const, descripcion: 'Tapa rota' };

  it('lo que el otro no ha tocado conserva lo escrito; lo que sí, trae su valor y va marcado', () => {
    const nuevo: Punto = { ...BOCA, racor: 'barcelona', direccion: 'Calle Nueva 1' };
    const { valores, tocados } = fusionarConNuevo(BOCA, nuevo, escrito);
    expect(tocados).toEqual(['enganche', 'direccion']);
    expect(valores.racor).toBe('barcelona');
    expect(valores.direccion).toBe('Calle Nueva 1');
    expect(valores.caudal).toBe('malo');
    expect(valores.descripcion).toBe('Tapa rota');
  });

  it('si el otro cambió el mismo campo, sale su valor marcado', () => {
    const nuevo: Punto = { ...BOCA, caudal: 'regular' };
    const { valores, tocados } = fusionarConNuevo(BOCA, nuevo, escrito);
    expect(tocados).toEqual(['estado']);
    expect(valores.caudal).toBe('regular');
    expect(valores.descripcion).toBe('Tapa rota');
  });

  it('la ubicación y el diámetro de otra medida cuentan como un campo cada uno', () => {
    const nuevo: Punto = { ...BOCA, lat: 37.2301, diametro_mm: 52 };
    const { valores, tocados } = fusionarConNuevo(BOCA, nuevo, escrito);
    expect(tocados).toEqual(['ubicacion', 'diametro']);
    expect(valores.pin).toEqual({ lat: 37.2301, lng: -3.65 });
    expect(valores.diametro).toBe('otro');
    expect(valores.diametroOtro).toBe('52');
  });

  it('si solo cambió algo que Editar no enseña, nada se marca y lo escrito queda entero', () => {
    const nuevo: Punto = { ...BOCA, foto_path: 'puntos/x.webp', datos_cambiados_en: '2026-10-02T00:00:00Z' };
    expect(fusionarConNuevo(BOCA, nuevo, escrito)).toEqual({ valores: escrito, tocados: [] });
  });
});
