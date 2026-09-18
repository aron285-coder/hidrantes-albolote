// Geometría de la zona de cobertura (FR-53, 04 §8) a partir de la respuesta de Overpass.
// Funciones puras: sin red ni disco, para poder probarlas.

import bbox from '@turf/bbox';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import buffer from '@turf/buffer';
import { featureCollection, multiPolygon, point } from '@turf/helpers';
import simplify from '@turf/simplify';
import truncate from '@turf/truncate';
import union from '@turf/union';
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon, Position } from 'geojson';

export type Municipio = 'albolote' | 'calicasas';

/** Código INE → valor del enum hidrantes.municipio (05 §1). */
export const MUNICIPIOS: Record<string, Municipio> = { '18003': 'albolote', '18037': 'calicasas' };

/** Tipos de `place` de OSM que son núcleos. `locality` son parajes sin población: no cuentan. */
export const LUGARES_NUCLEO = ['town', 'village', 'hamlet', 'suburb', 'quarter', 'neighbourhood'];

export interface MiembroOverpass {
  type: 'way' | 'node' | 'relation';
  role: string;
  geometry?: { lat: number; lon: number }[];
}

export interface RelacionOverpass {
  type: 'relation';
  id: number;
  tags: Record<string, string>;
  members: MiembroOverpass[];
}

export interface NodoOverpass {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

const mismo = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];

/**
 * Une vías sueltas en anillos cerrados, uniendo extremos iguales (dando la vuelta a una vía si
 * hace falta). Aborta si sobra un trozo que no cierra: un límite roto no debe pasar en silencio.
 */
export function unirAnillos(vias: Position[][]): Position[][] {
  const pendientes = vias.filter((v) => v.length > 1).map((v) => [...v]);
  const anillos: Position[][] = [];
  while (pendientes.length) {
    const anillo = pendientes.shift()!;
    while (!mismo(anillo[0], anillo.at(-1)!)) {
      const fin = anillo.at(-1)!;
      const i = pendientes.findIndex((v) => mismo(v[0], fin) || mismo(v.at(-1)!, fin));
      if (i === -1) throw new Error(`Anillo sin cerrar: termina en ${fin.join(',')}`);
      const [via] = pendientes.splice(i, 1);
      anillo.push(...(mismo(via[0], fin) ? via : via.reverse()).slice(1));
    }
    if (anillo.length >= 4) anillos.push(anillo);
  }
  return anillos;
}

/** Relación de límite → MultiPolygon (exteriores con sus huecos). */
export function poligonoDeRelacion(rel: RelacionOverpass): Feature<MultiPolygon> {
  const vias = (rol: string) =>
    rel.members
      .filter((m) => m.type === 'way' && (m.role || 'outer') === rol && m.geometry)
      .map((m) => m.geometry!.map((p) => [p.lon, p.lat]));
  const exteriores = unirAnillos(vias('outer'));
  const interiores = unirAnillos(vias('inner'));
  if (exteriores.length === 0) throw new Error(`La relación ${rel.id} no tiene anillo exterior`);
  const poligonos: Position[][][] = exteriores.map((e) => [e]);
  for (const hueco of interiores) {
    const dentro = poligonos.find((p) =>
      booleanPointInPolygon(point(hueco[0]), { type: 'Polygon', coordinates: [p[0]] }),
    );
    dentro?.push(hueco);
  }
  return multiPolygon(poligonos);
}

export interface OpcionesZona {
  margenMetros: number;
  /** Tolerancia de simplificación en grados (1e-4 ≈ 10 m). */
  tolerancia: number;
  version: string;
}

export interface Zona {
  limites: FeatureCollection<MultiPolygon, { municipio: Municipio; nombre: string; ine: string; osm_id: number }>;
  zona: Feature<Polygon | MultiPolygon, { margen_m: number; version: string }>;
  nucleos: FeatureCollection<Point, { nombre: string; municipio: Municipio; lugar: string; osm_id: number }>;
}

export function construirZona(relaciones: RelacionOverpass[], lugares: NodoOverpass[], o: OpcionesZona): Zona {
  const faltan = Object.keys(MUNICIPIOS).filter((ine) => !relaciones.some((r) => r.tags['ine:municipio'] === ine));
  if (faltan.length) throw new Error(`Overpass no devolvió los municipios INE ${faltan.join(', ')}`);

  const limites = featureCollection(
    relaciones
      .filter((r) => MUNICIPIOS[r.tags['ine:municipio']])
      .sort((a, b) => a.tags['ine:municipio'].localeCompare(b.tags['ine:municipio']))
      .map((r) => {
        const simple = truncate(simplify(poligonoDeRelacion(r), { tolerance: o.tolerancia, highQuality: true }), {
          precision: 6,
        });
        return {
          ...simple,
          properties: {
            municipio: MUNICIPIOS[r.tags['ine:municipio']],
            nombre: r.tags.name,
            ine: r.tags['ine:municipio'],
            osm_id: r.id,
          },
        };
      }),
  );

  const unidos = union(limites);
  if (!unidos) throw new Error('No se pudo unir los términos municipales');
  const conMargen = buffer(unidos, o.margenMetros, { units: 'meters', steps: 8 })!;
  const zonaSimple = truncate(simplify(conMargen, { tolerance: o.tolerancia, highQuality: true }), { precision: 6 });
  const zona: Zona['zona'] = {
    type: 'Feature',
    geometry: zonaSimple.geometry as Polygon | MultiPolygon,
    properties: { margen_m: o.margenMetros, version: o.version },
  };

  const nucleos = featureCollection(
    lugares
      .filter((n) => LUGARES_NUCLEO.includes(n.tags.place) && n.tags.name)
      .map((n) => {
        const p = point([Number(n.lon.toFixed(6)), Number(n.lat.toFixed(6))]);
        const municipio = municipioDe(p.geometry.coordinates, limites);
        return municipio
          ? { ...p, properties: { nombre: n.tags.name, municipio, lugar: n.tags.place, osm_id: n.id } }
          : null;
      })
      .filter((f): f is NonNullable<typeof f> => f !== null)
      .sort((a, b) => a.properties.nombre.localeCompare(b.properties.nombre, 'es')),
  );

  return { limites, zona, nucleos };
}

/** Municipio que contiene la coordenada [lon, lat], o null si está fuera de los dos términos. */
export function municipioDe(coordenada: Position, limites: Zona['limites']): Municipio | null {
  const f = limites.features.find((l) => booleanPointInPolygon(point(coordenada), l));
  return f ? f.properties.municipio : null;
}

/** Dentro de la zona de cobertura (término + margen): lo que usa el aviso de "fuera de zona" (FR-55). */
export function dentroDeZona(coordenada: Position, zona: Zona['zona']): boolean {
  return booleanPointInPolygon(point(coordenada), zona);
}

export function recuadro(zona: Zona['zona']): [number, number, number, number] {
  return bbox(zona) as [number, number, number, number];
}
