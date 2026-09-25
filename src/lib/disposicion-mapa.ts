// Medidas de los controles del mapa (06 §5, docs/21 RV-82, DEC-123). Una sola fuente: la usan la
// columna de la derecha, los botones de abajo, la ficha flotante, los avisos flotantes (docs/19 RV-59)
// y el encuadre del incidente (docs/19 RV-60). Nadie vuelve a calcularlas a mano.

export const CONTROLES = {
  /** Margen de la columna de la derecha con el borde del mapa (`right-2`). */
  margen: 8,
  /** Ancho de la columna: los iconos de 44 × 44. */
  ancho: 44,
  /** Aire entre la columna y lo que flota a su lado (avisos, ficha). */
  aire: 8,
  /** Margen de los botones de abajo con el borde derecho (`right-3`) y con el de abajo (`bottom-8`). */
  margenAbajoDerecha: 12,
  margenAbajo: 32,
  /** "+" de nuevo punto: 56 px. "Cercanos" extendido: 48 px de alto, 12 px por encima del "+". */
  nuevoPunto: 56,
  cercanosAlto: 48,
  separacion: 12,
} as const;

/** Lo que ocupa la columna por la derecha, con su aire: 8 + 44 + 8 = 60 px. */
export const RESERVA_DERECHA = CONTROLES.margen + CONTROLES.ancho + CONTROLES.aire;

/** Alto de la zona de botones de abajo (Cercanos y "+"), con su aire: 32 + 56 + 12 + 48 + 8 = 156 px. */
export const ZONA_ABAJO =
  CONTROLES.margenAbajo + CONTROLES.nuevoPunto + CONTROLES.separacion + CONTROLES.cercanosAlto + CONTROLES.aire;

/** Ancho de la ficha flotante en tableta y ordenador. */
export const ANCHO_FICHA = 360;

/** Lo que tapa la ficha flotante por la derecha, para el encuadre del incidente: la ficha, la columna y aire. */
export const MARGEN_FICHA_PX = ANCHO_FICHA + RESERVA_DERECHA + CONTROLES.aire;
