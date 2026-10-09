// Topes de peticiones por token en la propia Function (docs/19 RV-63, docs/33 RV-304). El contador vive
// en la memoria del aislado, así que no es global —Cloudflare reparte las peticiones entre varios—,
// pero frena un bucle de cliente, que es lo que se busca. Por encima, 429 DEMASIADOS_INTENTOS.

export const LIMITE_POR_MINUTO = 30;
/** Como mucho tantas claves en memoria por tope: se limpian las que ya no tienen nada en la ventana. */
const MAX_CLAVES = 5000;

/** Todas las memorias de los topes, para vaciarlas en los tests. */
const memorias = new Set<Map<string, number[]>>();

/**
 * Un tope de `limite` peticiones por clave en una ventana deslizante de `ventanaMs`, con su propia
 * memoria (así un tope por hora no se limpia con la ventana de uno por minuto).
 *
 * `pedir` cuenta la petición si cabe y devuelve null; si no cabe, no la cuenta y devuelve los segundos
 * (al menos 1) hasta que la más antigua de la ventana deje de contar.
 */
export function crearTope(limitePorDefecto: number, ventanaMs: number) {
  const ventanas = new Map<string, number[]>();
  memorias.add(ventanas);
  return {
    pedir(clave: string, ahora = Date.now(), limite = limitePorDefecto): number | null {
      const desde = ahora - ventanaMs;
      const recientes = (ventanas.get(clave) ?? []).filter((t) => t > desde);
      if (recientes.length >= limite) {
        ventanas.set(clave, recientes);
        return Math.max(1, Math.ceil((recientes[0]! + ventanaMs - ahora) / 1000));
      }
      recientes.push(ahora);
      ventanas.set(clave, recientes);
      if (ventanas.size > MAX_CLAVES) {
        for (const [k, v] of ventanas) if (!v.some((t) => t > desde)) ventanas.delete(k);
      }
      return null;
    },
  };
}

const porMinuto = crearTope(LIMITE_POR_MINUTO, 60_000);

/** ¿Cabe otra petición de `clave` ahora (30 por minuto)? Si cabe, la cuenta. */
export function dentroDelLimite(clave: string, ahora = Date.now(), limite = LIMITE_POR_MINUTO): boolean {
  return porMinuto.pedir(clave, ahora, limite) === null;
}

/** Solo para los tests. */
export function _reiniciarLimites(): void {
  for (const m of memorias) m.clear();
}
