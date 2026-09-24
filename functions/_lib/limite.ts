// Tope de peticiones por token en la propia Function (docs/19 RV-63): 30 por minuto. El contador vive
// en la memoria del aislado, así que no es global —Cloudflare reparte las peticiones entre varios—,
// pero frena un bucle de cliente, que es lo que se busca. Por encima, 429 DEMASIADOS_INTENTOS.

export const LIMITE_POR_MINUTO = 30;
const VENTANA_MS = 60_000;
/** Como mucho tantas claves en memoria: se limpian las que ya no tienen nada en la ventana. */
const MAX_CLAVES = 5000;

const ventanas = new Map<string, number[]>();

/** ¿Cabe otra petición de `clave` ahora? Si cabe, la cuenta. */
export function dentroDelLimite(clave: string, ahora = Date.now(), limite = LIMITE_POR_MINUTO): boolean {
  const desde = ahora - VENTANA_MS;
  const recientes = (ventanas.get(clave) ?? []).filter((t) => t > desde);
  if (recientes.length >= limite) {
    ventanas.set(clave, recientes);
    return false;
  }
  recientes.push(ahora);
  ventanas.set(clave, recientes);
  if (ventanas.size > MAX_CLAVES) {
    for (const [k, v] of ventanas) if (!v.some((t) => t > desde)) ventanas.delete(k);
  }
  return true;
}

/** Solo para los tests. */
export function _reiniciarLimites(): void {
  ventanas.clear();
}
