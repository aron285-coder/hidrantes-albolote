// docs/32 RV-236: lo que oye el lector de pantalla mientras se descarga el mapa base. El porcentaje
// cambia a cada trozo y, dentro de un `role="status"`, se anunciaba entero cada vez. Solo se anuncian
// cuatro momentos: el inicio, la mitad, el final y el error. El texto de la región viva solo cambia en
// esos momentos, así que el lector solo habla entonces.

import type { EstadoMapabase } from './mapabase';

export type HitoDescarga = 'inicio' | 'mitad' | 'final' | 'error';

/**
 * El hito que toca anunciar con el estado `e`, sabiendo el anterior. Sin descarga en marcha se
 * mantiene el último (el final o el error siguen dichos). El final solo sale de una descarga que se
 * ha visto empezar: al abrir la app con el mapa base ya en el móvil no se anuncia nada. El error sale
 * siempre: `fallo` no se guarda entre sesiones y se borra al empezar cada descarga, así que es de una
 * descarga de esta sesión aunque no se viera empezar.
 */
export function hitoDescarga(
  previo: HitoDescarga | null,
  e: Pick<EstadoMapabase, 'progreso' | 'fallo'>,
): HitoDescarga | null {
  if (e.progreso !== null) return e.progreso >= 50 ? 'mitad' : 'inicio';
  if (e.fallo) return 'error';
  if (previo === 'inicio' || previo === 'mitad') return 'final';
  return previo;
}
