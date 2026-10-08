// docs/32 RV-241: Mis propuestas dice cuándo no ha podido cargar. Sin lista guardada y con la carga
// fallida decía "Todavía no has propuesto nada", que es falso; con lista guardada y un error del
// servidor no decía nada.

import type { EstadoConexion } from './conexion';

export type Carga = 'cargando' | 'bien' | 'fallo';

/**
 * Qué aviso lleva la pantalla:
 * - `no_cargada`: no hay nada que enseñar y la carga ha fallado (con «Reintentar»);
 * - `cargando`: no hay nada que enseñar todavía;
 * - `vacia`: cargada y de verdad no hay nada;
 * - `sin_conexion`: hay lista guardada y no hay cobertura;
 * - `no_actualizada`: hay lista guardada y el servidor no ha contestado bien;
 * - null: la lista está al día.
 */
export function avisoMisPropuestas(
  carga: Carga,
  hayAlgo: boolean,
  conexion: EstadoConexion,
): 'no_cargada' | 'cargando' | 'vacia' | 'sin_conexion' | 'no_actualizada' | null {
  if (!hayAlgo) return carga === 'fallo' ? 'no_cargada' : carga === 'cargando' ? 'cargando' : 'vacia';
  if (conexion === 'sin_cobertura') return 'sin_conexion';
  if (carga === 'fallo') return 'no_actualizada';
  return null;
}
