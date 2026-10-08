// IndexedDB que se cae (docs/32 RV-231): iOS cierra la conexión tras mucho tiempo en segundo plano
// ("Connection to Indexed Database server lost") y otra pestaña puede pedir cerrarla. Antes todo
// fallaba hasta reiniciar la aplicación; ahora la siguiente operación abre otra conexión.

import { IDBFactory, forceCloseDatabase } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bd = await import('./bd');

type Fila = { clave_local: string; n: number };

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  bd._reiniciarBd();
});
afterEach(() => vi.unstubAllGlobals());

const conexion = async () => (await bd._conexionAbierta())!;
// Como lo hace el navegador al perder la conexión: con el evento close. (Los tipos de la librería piden la clase.)
const cerrarDeGolpe = (c: IDBDatabase) => forceCloseDatabase(c as unknown as Parameters<typeof forceCloseDatabase>[0]);

describe('IndexedDB se vuelve a abrir si se cae (RV-231)', () => {
  it('si el navegador cierra la conexión (onclose), la siguiente operación abre otra', async () => {
    const cola = bd.almacenCola<Fila>();
    await cola.guardar({ clave_local: 'a', n: 1 });
    cerrarDeGolpe(await conexion());
    await cola.guardar({ clave_local: 'b', n: 2 });
    expect((await cola.todos()).map((f) => f.clave_local)).toEqual(['a', 'b']);
  });

  it('una transacción sobre una conexión ya cerrada se repite una vez con otra', async () => {
    const cola = bd.almacenCola<Fila>();
    await cola.guardar({ clave_local: 'a', n: 1 });
    // close() no avisa con onclose: la conexión sigue guardada y la transacción lanza InvalidStateError.
    (await conexion()).close();
    await cola.guardar({ clave_local: 'b', n: 2 });
    expect(await cola.actualizar('a', (f) => (f ? { ...f, n: 5 } : null))).toEqual({ clave_local: 'a', n: 5 });
    expect((await cola.todos()).map((f) => f.n)).toEqual([5, 2]);
  });

  it('los puntos también: leer y escribir tras perder la conexión', async () => {
    const puntos = bd.almacenPuntos<{ id: string }>();
    await puntos.escribirMeta('sello', 1);
    cerrarDeGolpe(await conexion());
    await puntos.reemplazar([{ id: 'p1' }], []);
    expect(await puntos.leerMeta('sello')).toBe(1);
    expect(await puntos.todos()).toEqual([{ id: 'p1' }]);
  });

  it('otra pestaña con una versión nueva no se queda bloqueada: se cierra la conexión (onversionchange)', async () => {
    const cola = bd.almacenCola<Fila>();
    await cola.guardar({ clave_local: 'a', n: 1 });
    const bloqueada = vi.fn();
    const abierta = await new Promise<IDBDatabase>((ok, mal) => {
      const p = indexedDB.open('hidrantes', 99);
      p.onblocked = bloqueada;
      p.onsuccess = () => ok(p.result);
      p.onerror = () => mal(p.error);
    });
    expect(bloqueada).not.toHaveBeenCalled();
    abierta.close();
    expect(bd._conexionAbierta()).toBeNull();
  });

  it('al reabrir tras perderla, avisa a quien tenga algo pendiente de guardar', async () => {
    const cola = bd.almacenCola<Fila>();
    const aviso = vi.fn();
    bd.alReabrir(aviso);
    await cola.guardar({ clave_local: 'a', n: 1 });
    expect(aviso).not.toHaveBeenCalled();
    cerrarDeGolpe(await conexion());
    await cola.todos();
    expect(aviso).toHaveBeenCalledOnce();
  });

  it('otros errores no se repiten', async () => {
    const cola = bd.almacenCola<Fila>();
    await cola.guardar({ clave_local: 'a', n: 1 });
    const f = vi.fn(() => {
      throw new Error('de quien llama');
    });
    await expect(cola.actualizar('a', f)).rejects.toThrow('de quien llama');
    expect(f).toHaveBeenCalledOnce();
  });

  it('reconoce los errores de conexión perdida de iOS y de Chrome', () => {
    expect(bd.esConexionPerdida(new DOMException('x', 'InvalidStateError'))).toBe(true);
    expect(
      bd.esConexionPerdida(
        new DOMException('Connection to Indexed Database server lost. Refresh the page to try again', 'UnknownError'),
      ),
    ).toBe(true);
    expect(bd.esConexionPerdida(new DOMException('The database connection is closing.', 'InvalidStateError'))).toBe(
      true,
    );
    expect(bd.esConexionPerdida(new DOMException('lleno', 'QuotaExceededError'))).toBe(false);
    expect(bd.esConexionPerdida('texto')).toBe(false);
  });
});
