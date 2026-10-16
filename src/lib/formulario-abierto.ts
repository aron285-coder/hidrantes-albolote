/**
 * ¿Hay un formulario de operación abierto? (docs/39 RV-520, DEC-221). Lo marcan el formulario y su pantalla de
 * resultado: mientras haya uno, si el acceso de este móvil deja de valer, la app no salta a la entrada (se perdería lo
 * escrito); lo dice, deja guardar en el móvil y salta al cerrarlo.
 *
 * Al pasar del formulario a su pantalla de resultado, uno se desmonta antes de que el otro se monte: el aviso de
 * «ya no queda ninguno» espera a la siguiente vuelta, y no sale si para entonces se ha abierto otro.
 */

let abiertos = 0;
const oyentes = new Set<() => void>();

/** Marca uno abierto; devuelve la función que lo cierra (una vez). Pensada para un `useEffect`. */
export function abrirFormulario(): () => void {
  abiertos++;
  let cerrado = false;
  return () => {
    if (cerrado) return;
    cerrado = true;
    abiertos--;
    if (abiertos === 0) {
      setTimeout(() => {
        if (abiertos === 0) oyentes.forEach((o) => o());
      }, 0);
    }
  };
}

export const hayFormularioAbierto = (): boolean => abiertos > 0;

/** Avisa cuando no queda ningún formulario abierto. */
export function alCerrarFormularios(o: () => void): () => void {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

/** Solo para los tests: ninguno abierto (los oyentes se quedan: acceso se apunta una vez, al cargar). */
export function _reiniciarFormularios(): void {
  abiertos = 0;
}
