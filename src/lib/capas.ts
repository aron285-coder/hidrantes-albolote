// Capas del mapa (FR-63, 04 §8). Todas las URL en este archivo. Gratuitas y sin clave; las ráster se
// cargan como <img> (sin CORS) y solo en línea: el Service Worker no las guarda. Los orígenes están
// también en la CSP (config/cabeceras.ts, ORIGENES_CAPAS). El navegador envía el origen como Referer
// (Referrer-Policy strict-origin-when-cross-origin), que es lo que pide la política de OSM.

import { escribir, leer } from './almacen';
import type { EstadoConexion } from './conexion';
import { T } from './textos';

export type Capa = 'base' | 'calle' | 'satelite' | 'catastro';
export const CAPAS: Capa[] = ['base', 'calle', 'satelite', 'catastro'];

export const NOMBRE_CAPA: Record<Capa, string> = {
  base: T.mapa.mapaBasePropio,
  calle: T.mapa.calleOsm,
  satelite: T.mapa.satelitePnoa,
  catastro: T.mapa.catastro,
};

/** Capas que necesitan red. Catastro va superpuesta al mapa base propio. */
export const enLinea = (c: Capa) => c !== 'base';

/**
 * ¿Va el mapa base propio debajo de la capa elegida? Sin cobertura (o sin servidor) y con el mapa
 * base en el móvil, sí: sin señal, una capa solo en línea deja el mapa sin calles (RV-58, DEC-098).
 */
export const baseDebajo = (conexion: EstadoConexion, baseDescargado: boolean) => conexion !== 'bien' && baseDescargado;

/**
 * Lo que se pinta, de abajo arriba. Catastro va siempre sobre el mapa base; calle y satélite, solo
 * cuando toca `baseDebajo`. Encima queda la capa en línea, con lo que el navegador tenga en caché o
 * nada. La elección del usuario no cambia: al volver la cobertura todo queda como estaba.
 */
export function capasPintadas(capa: Capa, debajo: boolean): Capa[] {
  if (capa === 'base') return ['base'];
  return capa === 'catastro' || debajo ? ['base', capa] : [capa];
}

/**
 * Hasta dónde se puede acercar, en los dos mapas (el del voluntario y el del alta). A z21 se
 * distingue la acera de la calzada, que es lo que hace falta para poner el pin donde está el
 * hidrante y no "más o menos ahí".
 *
 * Ninguna capa ráster tiene teselas tan abajo: cada una declara hasta dónde llegan las suyas
 * (`maxNativeZoom`) y Leaflet amplía la última en vez de pedir una que no existe. **Sin eso la capa
 * se cae entera al pasar de su tope y la pantalla se queda en blanco.**
 */
export const ZOOM_MAX = 21;

export const OSM = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  // OSM publica hasta z19 (su política de teselas).
  opciones: { maxZoom: ZOOM_MAX, maxNativeZoom: 19, attribution: T.mapa.atribucionOsm },
};

export const PNOA = {
  url:
    'https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&layer=OI.OrthoimageCoverage' +
    '&style=default&tilematrixset=GoogleMapsCompatible&tilematrix={z}&tilerow={y}&tilecol={x}&format=image/jpeg',
  // El WMTS del IGN sirve hasta z20; a partir de z21 responde 400 con un XML de excepción.
  opciones: { maxZoom: ZOOM_MAX, maxNativeZoom: 20, attribution: T.mapa.atribucionPnoa },
};

export const CATASTRO = {
  url: 'https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx',
  opciones: {
    layers: 'Catastro',
    format: 'image/png',
    transparent: true,
    version: '1.1.1',
    // WMS: el servidor dibuja a la escala que se le pida, no hay teselas que se acaben.
    maxZoom: ZOOM_MAX,
    attribution: T.mapa.atribucionCatastro,
  },
};

export const ATRIBUCION_BASE = T.mapa.atribucionBase;

/** La última capa elegida se recuerda (FR-63) y es la "capa por defecto" de Ajustes (FR-93). */
export function capaGuardada(): Capa {
  const c = leer<Capa>('capa');
  return c && CAPAS.includes(c) ? c : 'base';
}

export const guardarCapa = (c: Capa) => escribir('capa', c);

/** Atribución visible de lo que se está viendo (licencias ODbL, IGN, Catastro). */
export function atribucion(c: Capa): string {
  if (c === 'calle') return OSM.opciones.attribution;
  if (c === 'satelite') return PNOA.opciones.attribution;
  if (c === 'catastro') return `${ATRIBUCION_BASE} · ${CATASTRO.opciones.attribution}`;
  return ATRIBUCION_BASE;
}
