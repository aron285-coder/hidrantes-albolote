// La hoja "Cercanos" en el móvil tiene dos alturas: media (55 %, la de siempre) y alta (90 %). La
// elegida se recuerda en sessionStorage durante la sesión (docs/19 RV-61); se pierde al cerrar la
// pestaña, como el incidente.

export type AlturaHoja = 'media' | 'alta';

const CLAVE = 'hidrantes.hoja_cercanos';

/** Qué parte del mapa ocupa la hoja con cada altura. */
export const FRACCION_HOJA: Record<AlturaHoja, number> = { media: 0.55, alta: 0.9 };

export function alturaHoja(): AlturaHoja {
  try {
    return sessionStorage.getItem(CLAVE) === 'alta' ? 'alta' : 'media';
  } catch {
    return 'media';
  }
}

export function guardarAlturaHoja(a: AlturaHoja): void {
  try {
    sessionStorage.setItem(CLAVE, a);
  } catch {
    // sin sessionStorage: vuelve a la media la próxima vez
  }
}

/** Arrastrar el asa: hacia arriba más de 30 px, alta; hacia abajo, media. Menos, no cambia. */
export function alturaTrasArrastrar(actual: AlturaHoja, desplazamientoY: number): AlturaHoja {
  if (desplazamientoY < -30) return 'alta';
  if (desplazamientoY > 30) return 'media';
  return actual;
}
