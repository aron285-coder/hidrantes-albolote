/**
 * Longitud máxima de cada texto libre (RV-140, DEC-174). Son los mismos números que comprueba
 * `fn_validar_datos` en el servidor (y las RPC de jefatura): si se pasan, `PAYLOAD_INVALIDO(<campo>)`.
 * Los usan los `maxLength` de la app (RV-155) y del panel (RV-168).
 */
export const LIMITES = {
  descripcion: 500,
  descripcion_fallo: 500,
  direccion: 200,
  /** Nota de la propuesta y motivos (retirada, rechazo, borrado). */
  nota: 1000,
  motivo: 1000,
  autor_nombre: 60,
  autor_apellido: 60,
} as const;

export type CampoConLimite = keyof typeof LIMITES;
