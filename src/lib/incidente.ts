// Modo incidente: los puntos más cercanos que funcionan (FR-74, G2; docs/18 GM-03). Todo en el móvil
// y sin cobertura: el incidente nunca sale de él (11 §6.1, DEC-089). Distancias en línea recta, que es
// lo que se puede saber sin un servicio de rutas (16 §2).

import type { LatLng } from './coordenadas';
import { metros, rumbo, tramos } from './geometria';
import type { Punto } from './puntos';

export interface Candidato {
  punto: Punto;
  metros: number;
  /** Grados desde el norte, del incidente al punto. */
  rumbo: number;
  /** Tramos de manguera mínimos para llegar en línea recta. */
  tramos: number;
}

export interface OpcionesCercanos {
  soloHidrantes: boolean;
  /** Cuántos como mucho (5). */
  n?: number;
  /** A partir de aquí ya no son "cercanos" (2 km). */
  maxMetros?: number;
  metrosTramo: number;
}

export const CERCANOS_N = 5;
export const CERCANOS_MAX_M = 2000;
/** Con menos diferencia que esto, gana el más aprovechable: el de mayor radio (06 §4). */
export const EMPATE_M = 10;

const funciona = (p: Punto) => p.caudal === 'bueno' || p.caudal === 'regular';

/** Los que cuentan según el conmutador "Solo hidrantes". */
const delTipo = (soloHidrantes: boolean) => (p: Punto) => !soloHidrantes || p.tipo === 'hidrante';

/**
 * Los `n` puntos que funcionan (bueno o regular) más cercanos a `origen`, a menos de `maxMetros`, en
 * orden de distancia. Dos a menos de 10 m entre sí: primero el de mayor `radio_px`.
 */
export function cercanos(puntos: Punto[], origen: LatLng, o: OpcionesCercanos): Candidato[] {
  const n = o.n ?? CERCANOS_N;
  const max = o.maxMetros ?? CERCANOS_MAX_M;
  const tipo = delTipo(o.soloHidrantes);
  const conDistancia: { punto: Punto; metros: number }[] = [];
  for (const p of puntos) {
    if (!funciona(p) || !tipo(p)) continue;
    const m = metros(origen, p);
    if (m <= max) conDistancia.push({ punto: p, metros: m });
  }
  conDistancia.sort((a, b) =>
    Math.abs(a.metros - b.metros) < EMPATE_M && a.punto.radio_px !== b.punto.radio_px
      ? b.punto.radio_px - a.punto.radio_px
      : a.metros - b.metros,
  );
  return conDistancia.slice(0, n).map(({ punto, metros: m }) => ({
    punto,
    metros: m,
    rumbo: rumbo(origen, punto),
    tramos: tramos(m, o.metrosTramo),
  }));
}

/**
 * El más cercano de todos (del tipo que se mira) si **no** funciona y está más cerca que el primero
 * que sí: para avisar y que nadie vaya a él por costumbre. Null si no hace falta avisar.
 */
export function masCercanoQueNoFunciona(
  puntos: Punto[],
  origen: LatLng,
  o: Pick<OpcionesCercanos, 'soloHidrantes' | 'maxMetros'>,
  primero: Candidato | undefined,
): { punto: Punto; metros: number } | null {
  const tipo = delTipo(o.soloHidrantes);
  const max = o.maxMetros ?? CERCANOS_MAX_M;
  let mejor: { punto: Punto; metros: number } | null = null;
  for (const p of puntos) {
    if (!tipo(p)) continue;
    const m = metros(origen, p);
    if (m <= max && (!mejor || m < mejor.metros)) mejor = { punto: p, metros: m };
  }
  if (!mejor || funciona(mejor.punto)) return null;
  if (primero && primero.metros <= mejor.metros) return null;
  return mejor;
}

// El incidente sobrevive a una recarga en la URL; la lista lo lee de sessionStorage para ordenar por
// distancia desde él (FR-74). Se pierde al cerrar la pestaña, y nunca va a IndexedDB ni al servidor.
const CLAVE = 'hidrantes.incidente';

export function recordarIncidente(l: LatLng | null): void {
  try {
    if (l) sessionStorage.setItem(CLAVE, JSON.stringify(l));
    else sessionStorage.removeItem(CLAVE);
  } catch {
    // sin sessionStorage: la lista ordena desde tu posición
  }
}

export function incidenteRecordado(): LatLng | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(CLAVE) ?? 'null') as LatLng | null;
    return v && Number.isFinite(v.lat) && Number.isFinite(v.lng) ? v : null;
  } catch {
    return null;
  }
}
