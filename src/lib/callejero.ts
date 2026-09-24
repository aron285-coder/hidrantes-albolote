// Callejero sin conexión (FR-73, TR-117, docs/18 GM-04): calles y lugares con nombre de la zona, de
// OpenStreetMap. `public/callejero.json` se descarga la primera vez que se busca (o se abre "¿Qué hay
// aquí?") y el Service Worker lo precachea: no va en el JS inicial y funciona sin cobertura. Con él
// llega `callejero-buscar.ts`, la búsqueda y la geometría, que sin los datos no sirven.

import type { LatLng } from './coordenadas';

export type Municipio = 'albolote' | 'calicasas';

export interface EntradaCallejero {
  n: string;
  t: 'calle' | 'lugar';
  m?: Municipio;
  /** Calles: multilínea [[[lng, lat], …], …]. */
  g?: [number, number][][];
  /** Lugares: [lng, lat]. */
  c?: [number, number];
}

export interface Callejero {
  version: string;
  fuente: string;
  entradas: EntradaCallejero[];
}

export type Buscador = typeof import('./callejero-buscar');

/** Los datos y las funciones que los usan: llegan juntos o no llega nada. */
export interface CallejeroCargado {
  datos: Callejero;
  f: Buscador;
}

/** "¿Qué hay aquí?" nombra la calle si está a menos de esto (docs/18 GM-02). */
export const METROS_CALLE_CERCANA = 60;

/** El número de portal del final, si lo hay ("calle real 12", "real, 12", "real 12b"). */
export const RE_NUMERO = /(?:,\s*|\s+)(\d{1,4}\s*[a-zA-Z]?)\s*$/;
export const llevaNumero = (texto: string) => RE_NUMERO.test(texto.trim());

let cargado: CallejeroCargado | null = null;
let cargando: Promise<CallejeroCargado | null> | null = null;

/** El callejero si ya se ha cargado; si no, null (sin pedirlo). */
export const callejeroCargado = () => cargado;

/**
 * Lo descarga una vez, con sus funciones, y lo guarda en memoria. Sin red y sin precacheo aún,
 * devuelve null y la próxima llamada lo vuelve a intentar: la búsqueda de puntos y coordenadas sigue
 * igual.
 */
export function cargarCallejero(): Promise<CallejeroCargado | null> {
  if (cargado) return Promise.resolve(cargado);
  cargando ??= Promise.all([
    fetch('/callejero.json').then((r) => (r.ok ? (r.json() as Promise<Callejero>) : null)),
    import('./callejero-buscar'),
  ])
    .then(([datos, f]) => (datos && Array.isArray(datos.entradas) ? { datos, f } : null))
    .catch(() => null)
    .then((c) => {
      cargando = null;
      if (c) cargado = c;
      return cargado;
    });
  return cargando;
}

/** Solo para los tests. */
export function olvidarCallejero(): void {
  cargado = null;
  cargando = null;
}

// ---------- la calle elegida en la búsqueda ----------

let resaltada: EntradaCallejero | null = null;

/** La calle elegida se resalta en el mapa durante la sesión (06 §4.7). */
export const calleResaltada = () => resaltada;
export function resaltarCalle(e: EntradaCallejero | null): void {
  resaltada = e;
}

/** Lo que el mapa hace al llegar desde un resultado: centrar a z18 o encuadrar la calle. */
export interface Enfoque {
  centro?: LatLng;
  recuadro?: [[number, number], [number, number]];
}
