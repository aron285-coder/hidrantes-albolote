// Callejero sin conexión (FR-73, TR-77, TR-117, DEC-093) a partir de la respuesta de Overpass.
// Funciones puras: sin red ni disco, para poder probarlas.

import { lineString } from '@turf/helpers';
import simplify from '@turf/simplify';
import type { Position } from 'geojson';
import { type Municipio, type Zona, dentroDeZona, municipioDe } from './zona.ts';

/** Tope del archivo sin comprimir (TR-117). En bytes, con el kB decimal: el más estricto. */
export const MAX_BYTES = 200_000;
/** Unos 3 m: suficiente para encuadrar y resaltar una calle, y el archivo cabe en el tope. */
export const TOLERANCIA = 0.00003;
export const FUENTE = '© colaboradores de OpenStreetMap (ODbL)';

/** Vías peatonales que solo entran si su nombre es de calle ("Calle …", "Paseo …"). */
const PEATONALES = new Set(['footway', 'path', 'steps', 'cycleway']);
/** Vías que aún no existen. */
const NO_CONSTRUIDAS = new Set(['proposed', 'construction']);
export const TIPO_DE_VIA =
  /^(calle|c\/|avenida|avda\.?|plaza|pza\.?|paseo|camino|carretera|ctra\.?|travesía|ronda|glorieta|callejón|callejon|cuesta|pasaje|carril|vereda|urbanización|urbanizacion|bulevar|rambla)\b/i;

export const AMENIDADES =
  'school|kindergarten|college|hospital|clinic|doctors|townhall|police|fire_station|social_facility|community_centre';
export const OCIO = 'park|sports_centre|stadium';

export function consulta([oeste, sur, este, norte]: [number, number, number, number]): string {
  return `[out:json][timeout:120][bbox:${sur},${oeste},${norte},${este}];
way[highway][name]->.calles;
.calles out geom;
(
  node[place][name];
  way[landuse=industrial][name];
  relation[landuse=industrial][name];
  nwr[amenity~"^(${AMENIDADES})$"][name];
  nwr[leisure~"^(${OCIO})$"][name];
)->.lugares;
.lugares out center tags;`;
}

export interface ElementoOverpass {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
}

export interface Entrada {
  n: string;
  t: 'calle' | 'lugar';
  /** Sin municipio si cae en el margen de la zona, fuera de los dos términos. */
  m?: Municipio;
  /** Calles: multilínea [[[lng, lat], …], …]. */
  g?: Position[][];
  /** Lugares: el punto o el centro. */
  c?: Position;
}

export interface Callejero {
  version: string;
  fuente: string;
  entradas: Entrada[];
}

const redondear = (p: Position): Position => [Number(p[0].toFixed(5)), Number(p[1].toFixed(5))];
const igual = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];

/** Une tramos que comparten un extremo (dándoles la vuelta si hace falta): menos puntos repetidos. */
export function unirTramos(tramos: Position[][]): Position[][] {
  const pendientes = tramos.filter((t) => t.length > 1).map((t) => [...t]);
  const unidos: Position[][] = [];
  while (pendientes.length) {
    const linea = pendientes.shift()!;
    let cambio = true;
    while (cambio) {
      cambio = false;
      for (let i = 0; i < pendientes.length; i++) {
        const t = pendientes[i];
        const ini = linea[0];
        const fin = linea[linea.length - 1];
        if (igual(fin, t[0])) linea.push(...t.slice(1));
        else if (igual(fin, t[t.length - 1])) linea.push(...[...t].reverse().slice(1));
        else if (igual(ini, t[t.length - 1])) linea.unshift(...t.slice(0, -1));
        else if (igual(ini, t[0])) linea.unshift(...[...t].reverse().slice(0, -1));
        else continue;
        pendientes.splice(i, 1);
        cambio = true;
        break;
      }
    }
    unidos.push(linea);
  }
  return unidos;
}

function simplificar(linea: Position[]): Position[] {
  const simple = simplify(lineString(linea), { tolerance: TOLERANCIA, highQuality: true }).geometry.coordinates;
  const salida: Position[] = [];
  for (const p of simple.map(redondear)) if (!salida.length || !igual(salida[salida.length - 1], p)) salida.push(p);
  return salida;
}

function esCalle(tags: Record<string, string>): boolean {
  if (!tags.highway || !tags.name || NO_CONSTRUIDAS.has(tags.highway)) return false;
  return !PEATONALES.has(tags.highway) || TIPO_DE_VIA.test(tags.name.trim());
}

export interface OpcionesCallejero {
  limites: Zona['limites'];
  zona: Zona['zona'];
  version: string;
}

export function construirCallejero(elementos: ElementoOverpass[], o: OpcionesCallejero): Callejero {
  // Calles: cada tramo cuenta por su punto medio, para la zona y para el municipio.
  const grupos = new Map<string, { n: string; m: Municipio | null; tramos: Position[][] }>();
  for (const e of elementos) {
    if (e.type !== 'way' || !e.tags || !e.geometry || e.geometry.length < 2 || !esCalle(e.tags)) continue;
    const linea = e.geometry.map((g) => [g.lon, g.lat]);
    const medio = linea[Math.floor(linea.length / 2)];
    if (!dentroDeZona(medio, o.zona)) continue;
    const n = e.tags.name.trim();
    const m = municipioDe(medio, o.limites);
    const clave = `${n}|${m ?? ''}`;
    const g = grupos.get(clave) ?? { n, m, tramos: [] };
    g.tramos.push(linea);
    grupos.set(clave, g);
  }
  const calles: Entrada[] = [...grupos.values()]
    .map(({ n, m, tramos }) => {
      const g = unirTramos(tramos)
        .map(simplificar)
        .filter((l) => l.length > 1);
      return { n, t: 'calle' as const, ...(m ? { m } : {}), g };
    })
    .filter((c) => c.g.length > 0);

  // Lugares: el primero con cada nombre y municipio (un colegio puede venir como nodo y como vía).
  const vistos = new Set<string>();
  const lugares: Entrada[] = [];
  for (const e of elementos) {
    if (!e.tags?.name || e.tags.highway) continue;
    const donde = e.center ?? (e.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lon: e.lon } : null);
    if (!donde) continue;
    const c = redondear([donde.lon, donde.lat]);
    if (!dentroDeZona(c, o.zona)) continue;
    const n = e.tags.name.trim();
    const m = municipioDe(c, o.limites);
    const clave = `${n}|${m ?? ''}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    lugares.push({ n, t: 'lugar', ...(m ? { m } : {}), c });
  }

  const entradas = [...calles, ...lugares].sort(
    (a, b) => a.n.localeCompare(b.n, 'es') || (a.m ?? '').localeCompare(b.m ?? '') || a.t.localeCompare(b.t),
  );
  return { version: o.version, fuente: FUENTE, entradas };
}

/** Una entrada por línea: diffs legibles al regenerar, y cabe en el tope. */
export function serializarCallejero(c: Callejero): string {
  const cabecera = JSON.stringify({ version: c.version, fuente: c.fuente });
  return `${cabecera.slice(0, -1)},"entradas":[\n${c.entradas.map((e) => JSON.stringify(e)).join(',\n')}\n]}\n`;
}

/** Lo que falla por encima del tope (TR-117), o null. */
export function motivoDemasiadoGrande(texto: string): string | null {
  const bytes = Buffer.byteLength(texto);
  return bytes > MAX_BYTES
    ? `El callejero ocupa ${(bytes / 1000).toFixed(1)} kB y el tope es ${MAX_BYTES / 1000} kB (TR-117).`
    : null;
}

/** Igual que el anterior salvo la versión: sin esto, cada regeneración abriría un PR de ruido (DEC-070). */
export function mismoCallejero(nuevo: string, anterior: string): boolean {
  const sinVersion = (t: string) => t.replace(/^\{"version":"\d{8}",/, '{"version":"-",');
  return sinVersion(nuevo) === sinVersion(anterior);
}

/** Resumen para datos/callejero.json, que lee Salud del sistema a través de config (FR-143). */
export function resumenCallejero(c: Callejero, datosOsm: string | null, bytes: number) {
  return {
    version: c.version,
    datos_osm: datosOsm,
    fuente: c.fuente,
    entradas: c.entradas.length,
    calles: c.entradas.filter((e) => e.t === 'calle').length,
    lugares: c.entradas.filter((e) => e.t === 'lugar').length,
    bytes,
  };
}
