// IndexedDB del móvil: los puntos aprobados y su sello de sincronización (FR-80, 05 §10). La cola de
// propuestas llegará aquí en la Fase 6. Sin librería: dos almacenes y cuatro operaciones.
// Si IndexedDB no existe o falla (modo privado, Safari que desaloja: TR-07), todo sigue en memoria.

const NOMBRE = 'hidrantes';
const VERSION = 1;

export interface Almacen<T> {
  todos(): Promise<T[]>;
  reemplazar(items: T[], borrar: string[], vaciar?: boolean): Promise<void>;
  leerMeta<V>(clave: string): Promise<V | null>;
  escribirMeta(clave: string, valor: unknown): Promise<void>;
  borrarTodo(): Promise<void>;
}

let abierta: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  abierta ??= new Promise((resolver, rechazar) => {
    const p = indexedDB.open(NOMBRE, VERSION);
    p.onupgradeneeded = () => {
      const bd = p.result;
      if (!bd.objectStoreNames.contains('puntos')) bd.createObjectStore('puntos', { keyPath: 'id' });
      if (!bd.objectStoreNames.contains('meta')) bd.createObjectStore('meta');
    };
    p.onsuccess = () => resolver(p.result);
    p.onerror = () => rechazar(p.error);
  });
  abierta.catch(() => (abierta = null));
  return abierta;
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
    async todos() {
      const bd = await abrir();
      return promesa(bd.transaction('puntos').objectStore('puntos').getAll()) as Promise<T[]>;
    },
    async reemplazar(items, borrar, vaciar = false) {
      const bd = await abrir();
      const t = bd.transaction('puntos', 'readwrite');
      const s = t.objectStore('puntos');
      if (vaciar) s.clear();
      for (const id of borrar) s.delete(id);
      for (const item of items) s.put(item);
      await fin(t);
    },
    async leerMeta<V>(clave: string) {
      const bd = await abrir();
      return ((await promesa(bd.transaction('meta').objectStore('meta').get(clave))) ?? null) as V | null;
    },
    async escribirMeta(clave, valor) {
      const bd = await abrir();
      const t = bd.transaction('meta', 'readwrite');
      t.objectStore('meta').put(valor, clave);
      await fin(t);
    },
    async borrarTodo() {
      const bd = await abrir();
      const t = bd.transaction(['puntos', 'meta'], 'readwrite');
      t.objectStore('puntos').clear();
      t.objectStore('meta').clear();
      await fin(t);
    },
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
