// Pulsación larga sobre el mapa para dar de alta un punto ahí mismo (FR-50, DEC-077). Es el gesto
// de Google Maps, que la gente ya trae aprendido.
//
// Aquí solo está la máquina de estados —cuándo cuenta como pulsación larga y cuándo no—, sin tocar
// el DOM: el componente le pasa los eventos y ella decide. Así se puede probar de verdad.
//
// No vale para el ratón: en escritorio el gesto equivalente es el clic derecho (`contextmenu`), que
// el navegador da hecho.

/** Lo que el detector necesita de un evento de puntero. */
export interface Puntero {
  clientX: number;
  clientY: number;
  /** `false` cuando es el segundo dedo: entonces no es una pulsación, es un pellizco para el zoom. */
  isPrimary?: boolean;
}

/** Medio segundo: menos dispara al arrastrar el mapa y más se siente como que no responde. */
export const MS_PULSACION = 500;
/** Un dedo nunca está del todo quieto; más de esto ya es arrastrar el mapa. */
export const TOLERANCIA_PX = 12;

export interface Detector {
  bajar(p: Puntero): void;
  mover(p: Puntero): void;
  soltar(): void;
  /** Para cuando el propio mapa se lleva el gesto (zoom, desplazamiento) o el navegador lo cancela. */
  cancelar(): void;
  /** Solo para los tests: si hay una cuenta atrás en marcha. */
  esperando(): boolean;
}

export function detectorPulsacionLarga(
  alDisparar: (p: Puntero) => void,
  { ms = MS_PULSACION, tolerancia = TOLERANCIA_PX } = {},
): Detector {
  let cuenta: ReturnType<typeof setTimeout> | undefined;
  let inicio: Puntero | null = null;

  const cancelar = () => {
    clearTimeout(cuenta);
    cuenta = undefined;
    inicio = null;
  };

  return {
    bajar(p) {
      // Un segundo dedo cancela: quien va a hacer zoom no está pidiendo un punto nuevo.
      if (p.isPrimary === false) return cancelar();
      cancelar();
      inicio = p;
      cuenta = setTimeout(() => {
        const donde = inicio;
        cancelar();
        if (donde) alDisparar(donde);
      }, ms);
    },
    mover(p) {
      if (!inicio) return;
      if (Math.hypot(p.clientX - inicio.clientX, p.clientY - inicio.clientY) > tolerancia) cancelar();
    },
    soltar: cancelar,
    cancelar,
    esperando: () => cuenta !== undefined,
  };
}
