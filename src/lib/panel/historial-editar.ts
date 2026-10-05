// La entrada de historial que abre Editar (docs/29 RV-124). Vive aquí y no en descartar.tsx para que
// ese archivo solo exporte componentes y Vite pueda refrescarlo en caliente (docs/30 RV-129).

/** La entrada de historial de Editar lleva este campo, con un valor distinto en cada apertura. */
export const MARCA = 'editarPunto';
export const marcaActual = () => (window.history.state as Record<string, unknown> | null)?.[MARCA];

/**
 * Quita la entrada de historial de Editar si es la de arriba. Para cuando el Inventario cierra Editar
 * por su cuenta (se ha retirado o borrado el punto que se editaba).
 */
export function quitarEntradaDeEditar() {
  if (marcaActual()) window.history.back();
}
