// Utilidades de los tests de src/lib (entorno node, sin navegador).

import { vi } from 'vitest';

/** localStorage en memoria; `roto` simula modo privado o espacio lleno (TR-07). */
export function almacenEnMemoria(roto = false): Map<string, string> {
  const datos = new Map<string, string>();
  const fallar = () => {
    throw new DOMException('QuotaExceededError');
  };
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (roto ? fallar() : (datos.get(k) ?? null)),
    setItem: (k: string, v: string) => (roto ? fallar() : void datos.set(k, String(v))),
    removeItem: (k: string) => (roto ? fallar() : void datos.delete(k)),
    clear: () => datos.clear(),
    key: (i: number) => [...datos.keys()][i] ?? null,
    get length() {
      return datos.size;
    },
  });
  return datos;
}

/** Respuesta de fetch con cuerpo JSON. */
export const respuesta = (estado: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });
