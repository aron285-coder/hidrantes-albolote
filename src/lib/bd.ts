// IndexedDB del móvil: los puntos aprobados y su sello de sincronización (FR-80, 05 §10) y la cola
// de propuestas con sus fotos (FR-82, Fase 6). Sin librería: tres almacenes y pocas operaciones.
// Si IndexedDB no existe o falla (modo privado, Safari que desaloja: TR-07), todo sigue en memoria.

const NOMBRE = 'hidrantes';
const VERSION = 2;

export interface Almacen<T> {
  todos(): Promise<T[]>;
  reemplazar(items: T[], borrar: string[], vaciar?: boolean): Promise<void>;
  leerMeta<V>(clave: string): Promise<V | null>;
  escribirMeta(clave: string, valor: unknown): Promise<void>;
  borrarTodo(): Promise<void>;
}

let abierta: Promise<IDBDatabase> | null = null;
/** La conexión anterior se cayó: al abrir la siguiente se avisa a quien tenga algo pendiente (RV-231). */
let perdida = false;
const alReabrirse = new Set<() => void>();

/** Se llama cada vez que IndexedDB vuelve a abrirse tras perder la conexión (docs/32 RV-231). */
export function alReabrir(f: () => void): () => void {
  alReabrirse.add(f);
  return () => alReabrirse.delete(f);
}

/** Olvida la conexión: la siguiente operación abre otra. Solo si sigue siendo la misma promesa. */
function olvidar(de: Promise<IDBDatabase> | null) {
  if (abierta !== de) return;
  abierta = null;
  perdida = true;
}

function abrir(): Promise<IDBDatabase> {
  if (abierta) return abierta;
  const esta: Promise<IDBDatabase> = new Promise((resolver, rechazar) => {
    const p = indexedDB.open(NOMBRE, VERSION);
    p.onupgradeneeded = () => {
      const bd = p.result;
      if (!bd.objectStoreNames.contains('puntos')) bd.createObjectStore('puntos', { keyPath: 'id' });
      if (!bd.objectStoreNames.contains('meta')) bd.createObjectStore('meta');
      if (!bd.objectStoreNames.contains('cola')) bd.createObjectStore('cola', { keyPath: 'clave_local' });
    };
    p.onsuccess = () => {
      const bd = p.result;
      // iOS cierra la conexión tras mucho tiempo en segundo plano ("Connection to Indexed Database
      // server lost"), y otra pestaña con una versión nueva pide cerrarla: en los dos casos se olvida
      // y la siguiente operación abre otra (docs/32 RV-231). Antes se quedaba rota hasta reiniciar.
      bd.onclose = () => olvidar(esta);
      bd.onversionchange = () => {
        bd.close();
        olvidar(esta);
      };
      resolver(bd);
      if (perdida) {
        perdida = false;
        alReabrirse.forEach((f) => f());
      }
    };
    p.onerror = () => rechazar(p.error);
  });
  abierta = esta;
  esta.catch(() => {
    if (abierta === esta) abierta = null;
  });
  return esta;
}

/**
 * ¿Es la conexión perdida o cerrada? `transaction()` sobre una conexión cerrada lanza
 * InvalidStateError; iOS da UnknownError con "Connection to Indexed Database server lost".
 */
export function esConexionPerdida(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const name = String((e as { name?: unknown }).name ?? '');
  const message = String((e as { message?: unknown }).message ?? '');
  return (
    name === 'InvalidStateError' ||
    (name === 'UnknownError' && /connection|server lost/i.test(message)) ||
    /connection to indexed database server lost|database connection is closing/i.test(message)
  );
}

/** Solo para los tests: la conexión abierta, y empezar de cero. */
export const _conexionAbierta = () => abierta;
export function _reiniciarBd() {
  abierta = null;
  perdida = false;
  alReabrirse.clear();
}

/**
 * Hace la operación con la conexión abierta. Si la conexión se ha perdido, se olvida, se abre otra
 * **una vez** y se repite (docs/32 RV-231). Cualquier otro error, o el segundo, llega a quien llama.
 */
async function conConexion<R>(hacer: (bd: IDBDatabase) => Promise<R>): Promise<R> {
  const promesa = abrir();
  try {
    return await hacer(await promesa);
  } catch (e) {
    if (!esConexionPerdida(e)) throw e;
    olvidar(promesa);
    return hacer(await abrir());
  }
}

function promesa<T>(p: IDBRequest<T>): Promise<T> {
  return new Promise((resolver, rechazar) => {
    p.onsuccess = () => resolver(p.result);
    p.onerror = () => rechazar(p.error);
  });
}

function fin(t: IDBTransaction): Promise<void> {
  return new Promise((resolver, rechazar) => {
    t.oncomplete = () => resolver();
    t.onerror = t.onabort = () => rechazar(t.error);
  });
}

/** Almacén en IndexedDB; si no hay IndexedDB, uno en memoria. */
export function almacenPuntos<T extends { id: string }>(): Almacen<T> {
  if (typeof indexedDB === 'undefined') return almacenEnMemoria<T>();
  return {
    todos: () => conConexion((bd) => promesa(bd.transaction('puntos').objectStore('puntos').getAll()) as Promise<T[]>),
    reemplazar: (items, borrar, vaciar = false) =>
      conConexion((bd) => {
        const t = bd.transaction('puntos', 'readwrite');
        const s = t.objectStore('puntos');
        if (vaciar) s.clear();
        for (const id of borrar) s.delete(id);
        for (const item of items) s.put(item);
        return fin(t);
      }),
    leerMeta: <V>(clave: string) =>
      conConexion(
        async (bd) => ((await promesa(bd.transaction('meta').objectStore('meta').get(clave))) ?? null) as V | null,
      ),
    escribirMeta: (clave, valor) =>
      conConexion((bd) => {
        const t = bd.transaction('meta', 'readwrite');
        t.objectStore('meta').put(valor, clave);
        return fin(t);
      }),
    borrarTodo: () =>
      conConexion((bd) => {
        const t = bd.transaction(['puntos', 'meta'], 'readwrite');
        t.objectStore('puntos').clear();
        t.objectStore('meta').clear();
        return fin(t);
      }),
  };
}

/** Misma interfaz en memoria: para los tests y para navegadores sin IndexedDB. */
export function almacenEnMemoria<T extends { id: string }>(): Almacen<T> {
  const puntos = new Map<string, T>();
  const meta = new Map<string, unknown>();
  return {
    todos: async () => [...puntos.values()],
    async reemplazar(items, borrar, vaciar = false) {
      if (vaciar) puntos.clear();
      for (const id of borrar) puntos.delete(id);
      for (const item of items) puntos.set(item.id, item);
    },
    leerMeta: async <V>(clave: string) => (meta.get(clave) as V) ?? null,
    escribirMeta: async (clave, valor) => void meta.set(clave, valor),
    async borrarTodo() {
      puntos.clear();
      meta.clear();
    },
  };
}

// ---------- cola de propuestas (Fase 6) ----------

export interface AlmacenCola<T extends { clave_local: string }> {
  todos(): Promise<T[]>;
  guardar(item: T): Promise<void>;
  /**
   * Lee el elemento, lo cambia con `f` y lo escribe, todo en la misma transacción (docs/31 RV-156):
   * nada se cuela entre la lectura y la escritura. `f` recibe null si no está; si devuelve null, no
   * se escribe nada. Devuelve lo escrito.
   */
  actualizar(clave: string, f: (actual: T | null) => T | null): Promise<T | null>;
  quitar(clave: string): Promise<void>;
  vaciar(): Promise<void>;
}

/** La cola en IndexedDB (con los blobs de las fotos); si no hay IndexedDB, en memoria. */
export function almacenCola<T extends { clave_local: string }>(): AlmacenCola<T> {
  if (typeof indexedDB === 'undefined') return colaEnMemoria<T>();
  const enTransaccion = (bd: IDBDatabase, f: (s: IDBObjectStore) => void) => {
    const t = bd.transaction('cola', 'readwrite');
    f(t.objectStore('cola'));
    return fin(t);
  };
  const escribirUno = (f: (s: IDBObjectStore) => void) => conConexion((bd) => enTransaccion(bd, f));
  return {
    todos: () => conConexion((bd) => promesa(bd.transaction('cola').objectStore('cola').getAll()) as Promise<T[]>),
    guardar: (item) => escribirUno((s) => s.put(item)),
    // Cada intento (también el de después de reabrir, RV-231) lee y escribe de nuevo en su transacción.
    actualizar: (clave, f) =>
      conConexion(async (bd) => {
        let escrito: T | null = null;
        let fallo: unknown = null;
        try {
          await enTransaccion(bd, (s) => {
            const p = s.get(clave);
            // Dentro de onsuccess la transacción sigue viva: el put va en la misma.
            p.onsuccess = () => {
              try {
                escrito = f((p.result as T | undefined) ?? null);
                if (escrito) s.put(escrito);
              } catch (e) {
                // Que se sepa el error de verdad, no el AbortError de la transacción.
                fallo = e;
                s.transaction.abort();
              }
            };
          });
        } catch (e) {
          throw fallo ?? e;
        }
        return escrito;
      }),
    quitar: (clave) => escribirUno((s) => s.delete(clave)),
    vaciar: () => escribirUno((s) => s.clear()),
  };
}

export function colaEnMemoria<T extends { clave_local: string }>(): AlmacenCola<T> {
  const items = new Map<string, T>();
  return {
    todos: async () => [...items.values()],
    guardar: async (item) => void items.set(item.clave_local, item),
    actualizar: async (clave, f) => {
      const nuevo = f(items.get(clave) ?? null);
      if (nuevo) items.set(clave, nuevo);
      return nuevo;
    },
    quitar: async (clave) => void items.delete(clave),
    vaciar: async () => items.clear(),
  };
}
