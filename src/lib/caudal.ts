// Estados de caudal que esta versión de la app conoce (06 §2.2, FR-18) y qué hacer con uno que no
// conoce (docs/24 RV-102a). El servidor puede añadir un estado nuevo antes de que todos los móviles
// se actualicen: la app vieja no se rompe, lo dibuja como «no funciona» (tamaño mínimo, gris y
// tachado) y avisa una vez de que hay que actualizar.

import type { Caudal } from '../tipos/punto';
import { anotarError } from './errores';

/** En el orden de la escala, de mejor a peor (también el del orden "por estado" de la lista). */
export const CAUDALES: readonly Caudal[] = ['bueno', 'regular', 'malo', 'barro', 'no_funciona'];

/** No se pueden usar (FR-68, filtro «No utilizable»): no funciona y barro (DEC-145). */
export const esNoUtilizable = (c: string) => {
  const conocido = caudalParaDibujar(c);
  return conocido === 'no_funciona' || conocido === 'barro';
};

export function esCaudalConocido(c: unknown): c is Caudal {
  return typeof c === 'string' && (CAUDALES as readonly string[]).includes(c);
}

let avisado = false;

/**
 * El caudal tal cual si se conoce; si no, `no_funciona`, y se anota un error una sola vez por
 * sesión. El mensaje no lleva ni el valor ni nada del punto (TR-90).
 */
export function caudalParaDibujar(c: string): Caudal {
  if (esCaudalConocido(c)) return c;
  if (!avisado) {
    avisado = true;
    try {
      anotarError(new Error('Caudal desconocido en los datos: esta versión de la app es anterior al servidor'));
    } catch {
      // Se llama desde el dibujo del mapa: si ni siquiera se puede anotar (almacenamiento lleno o
      // bloqueado), no hay dónde avisar y el mapa tiene que seguir pintándose.
    }
  }
  return 'no_funciona';
}

/** Solo para los tests. */
export function reiniciarAvisoCaudal(): void {
  avisado = false;
}
