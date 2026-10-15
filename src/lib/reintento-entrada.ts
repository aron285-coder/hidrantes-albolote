// docs/37 RV-491 (DEC-211): con «mucha gente entrando a la vez» (OCUPADO), la app espera lo que dice el
// servidor más un poco al azar, para que no vuelvan todos en el mismo segundo, y lo intenta sola.

/** Reintentos solos seguidos tras OCUPADO. Si el último también da OCUPADO, se entra a mano. */
export const REINTENTOS_OCUPADO = 3;
/** Lo que se suma al azar a la espera del servidor, como mucho (en segundos). */
export const AZAR_OCUPADO_S = 10;

/**
 * Segundos que esperar antes de reintentar: `reintentar_en_s` del servidor (1–60; sin él, 30) más entre
 * 0 y AZAR_OCUPADO_S al azar. `azar` devuelve un número en [0, 1), como Math.random.
 */
export function esperaOcupado(reintentarEnS: number | undefined, azar: () => number = Math.random): number {
  const base =
    typeof reintentarEnS === 'number' && Number.isFinite(reintentarEnS)
      ? Math.min(60, Math.max(1, Math.round(reintentarEnS)))
      : 30;
  const extra = Math.min(AZAR_OCUPADO_S, Math.max(0, Math.floor(azar() * (AZAR_OCUPADO_S + 1))));
  return base + extra;
}
