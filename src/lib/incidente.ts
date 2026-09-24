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
 * Orden por distancia y, después, **una pasada** de desempate entre vecinos: si el siguiente está a
 * menos de 10 m del actual y tiene mayor `radio_px`, se intercambian una sola vez y se avanza dos.
 * Así un punto nunca adelanta a otro que está más de 10 m más cerca, y el resultado no depende del
 * orden de entrada (docs/19 RV-54). A igual distancia, por código: determinista.
 */
export function ordenar<T extends { metros: number; punto: Pick<Punto, 'radio_px' | 'codigo'> }>(lista: T[]): T[] {
  const r = [...lista].sort((a, b) => a.metros - b.metros || a.punto.codigo.localeCompare(b.punto.codigo));
  for (let i = 0; i + 1 < r.length;) {
    const actual = r[i]!;
    const siguiente = r[i + 1]!;
    if (siguiente.metros - actual.metros < EMPATE_M && siguiente.punto.radio_px > actual.punto.radio_px) {
      r[i] = siguiente;
      r[i + 1] = actual;
      i += 2;
    } else i += 1;
  }
  return r;
}

/**
 * Los `n` puntos que funcionan (bueno o regular) más cercanos a `origen`, a menos de `maxMetros`, en
 * orden de distancia. Dos vecinos a menos de 10 m: primero el de mayor `radio_px` (`ordenar`).
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
  return ordenar(conDistancia)
    .slice(0, n)
    .map(({ punto, metros: m }) => ({
      punto,
      metros: m,
      rumbo: rumbo(origen, punto),
      tramos: tramos(m, o.metrosTramo),
    }));
}

/**
 * El más cercano de todos (del tipo que se mira) si **no** funciona y está más cerca que el más
 * cercano de los que sí: para avisar y que nadie vaya a él por costumbre. Null si no hace falta avisar.
 * Se compara con la distancia mínima de los candidatos, no con el primero de la lista, que puede ir
 * delante por el desempate de radio (docs/19 RV-54).
 */
export function masCercanoQueNoFunciona(
  puntos: Punto[],
  origen: LatLng,
  o: Pick<OpcionesCercanos, 'soloHidrantes' | 'maxMetros'>,
  candidatos: Candidato[],
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
  const minimo = Math.min(...candidatos.map((c) => c.metros));
  if (candidatos.length && minimo <= mejor.metros) return null;
  return mejor;
}

/**
 * El origen del GPS tal como va en la URL: `&gps=<momento_ms>,<precision_m>` (docs/19 RV-59). Así la
 * cabecera, el aviso de poca precisión y el de posición vieja miran la posición que se usó, no la de
 * ahora, y sobreviven a una recarga. `gps=1` (versión anterior) es GPS sin esos datos.
 */
export interface OrigenGps {
  momento: number | null;
  precision: number | null;
}

/** A partir de aquí la posición es "poco precisa": wifi o antena, no GPS (RV-59). */
export const PRECISION_POCA_M = 50;
/** Con el origen más viejo que esto, la hoja dice de cuándo es (RV-40, RV-59). */
export const ORIGEN_VIEJO_MS = 60_000;

export function leerGps(param: string | null): OrigenGps | null {
  if (param === null) return null;
  const m = /^(\d{10,16}),(\d{1,6})$/.exec(param);
  return m ? { momento: Number(m[1]), precision: Number(m[2]) } : { momento: null, precision: null };
}

export const parametroGps = (p: { precision: number; momento?: number }, ahora = Date.now()): string =>
  `${Math.round(p.momento ?? ahora)},${Math.round(p.precision)}`;

/** El momento del origen si ya tiene más de un minuto; si no, o sin datos, null. */
export const origenViejo = (g: OrigenGps | null, ahora = Date.now()): number | null =>
  g?.momento != null && ahora - g.momento > ORIGEN_VIEJO_MS ? g.momento : null;
