// Almacenamiento local del móvil (localStorage) que nunca rompe la app: en modo privado, con el
// espacio lleno o si el sistema lo desaloja (TR-07), lee null y escribe en vano, sin excepciones.

const PREFIJO = 'hidrantes.';

export function leer<T>(clave: string): T | null {
  try {
    const v = localStorage.getItem(PREFIJO + clave);
    return v === null ? null : (JSON.parse(v) as T);
  } catch {
    return null;
  }
}

export function escribir(clave: string, valor: unknown): void {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
  } catch {
    // sin espacio o sin almacenamiento: la app sigue en memoria
  }
}

export function borrar(clave: string): void {
  try {
    localStorage.removeItem(PREFIJO + clave);
  } catch {
    // nada que borrar
  }
}
