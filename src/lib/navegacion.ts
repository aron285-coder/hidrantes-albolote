import type { NavigateFunction } from 'react-router';

/** ¿Hay una pantalla de la app antes de esta en el historial? React Router numera las entradas en `idx`. */
export const hayAnterior = (): boolean =>
  typeof window !== 'undefined' && ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;

/**
 * «Volver» de una pantalla que puede ser la primera del historial (abierta por un enlace directo o
 * desde una notificación): a la anterior si la hay; si no, al inicio, en vez de no hacer nada o salir
 * de la app (UI-01, docs/35 RV-420).
 */
export function volverOAlInicio(navegar: NavigateFunction): void {
  if (hayAnterior()) void navegar(-1);
  else void navegar('/', { replace: true });
}
