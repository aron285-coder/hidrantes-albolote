// Genera la zona de cobertura desde OpenStreetMap (FR-53, 04 §8, 09 Fase 1).
//
//   npm run zona
//
// Escribe en datos/ (los GeoJSON y meta.json se committean; el build nunca depende de Overpass):
//   limite-municipal.geojson   términos de Albolote y Calicasas, simplificados (→ hidrantes.limite_municipal)
//   zona-cobertura.geojson     unión de ambos + margen de 400 m (aviso de fuera de zona, FR-55)
//   nucleos.geojson            núcleos de población con su municipio (→ hidrantes.nucleos)
//   meta.json                  versión, fecha de los datos OSM, parámetros
//   zona-cobertura.html        previsualización con Leaflet (no se committea)
//
// Si Overpass y sus espejos fallan, los GeoJSON committeados siguen valiendo. Fuente alternativa
// escrita (sin automatizar): límites municipales del IECA, DERA G13 "Límites administrativos"
// (https://www.juntadeandalucia.es/institutodeestadisticaycartografia/dega/datos-espaciales-de-referencia-de-andalucia-dera),
// capa de términos municipales, códigos INE 18003 y 18037.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, abortar, ejecutarScript, log } from './lib/comun.ts';
import {
  MUNICIPIOS,
  construirZona,
  recuadro,
  type NodoOverpass,
  type RelacionOverpass,
  type Zona,
} from './lib/zona.ts';

export const MARGEN_METROS = 400; // FR-53; config.buffer_zona_m es informativo (05 §2.10)
export const TOLERANCIA = 0.0001; // ≈ 10 m: suficiente para avisar, ligero para el móvil

const ESPEJOS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const AGENTE = 'hidrantes-albolote/1.0 (+https://github.com/aron285-coder/hidrantes-albolote)';

const CONSULTA = `[out:json][timeout:120];
rel["boundary"="administrative"]["admin_level"="8"]["ine:municipio"~"^(${Object.keys(MUNICIPIOS).join('|')})$"]->.m;
.m out geom;
.m map_to_area->.a;
node(area.a)["place"];
out;`;

interface RespuestaOverpass {
  osm3s?: { timestamp_osm_base?: string };
  elements: (RelacionOverpass | NodoOverpass)[];
}

async function consultarOverpass(): Promise<RespuestaOverpass> {
  for (const url of ESPEJOS) {
    try {
      log.info(`Overpass: ${new URL(url).host}`);
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': AGENTE, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: CONSULTA }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as RespuestaOverpass;
    } catch (e) {
      log.aviso(`${new URL(url).host} no respondió (${(e as Error).message}); pruebo el siguiente`);
    }
  }
  abortar(
    'Ningún servidor Overpass respondió. Los GeoJSON committeados siguen valiendo; vuelve a intentarlo más tarde.',
  );
}

function escribir(nombre: string, contenido: string): void {
  writeFileSync(path.join(RAIZ, 'datos', nombre), contenido);
  log.ok(`datos/${nombre} (${(Buffer.byteLength(contenido) / 1024).toFixed(1)} kB)`);
}

/** GeoJSON con una Feature por línea: compacto y con diffs legibles al regenerar. */
export function serializar(fc: { type: string; features?: unknown[] }): string {
  if (!fc.features) return `${JSON.stringify(fc)}\n`;
  const { features, ...resto } = fc;
  const cabecera = JSON.stringify(resto).slice(0, -1);
  return `${cabecera},"features":[\n${features.map((f) => JSON.stringify(f)).join(',\n')}\n]}\n`;
}

export function htmlPrevisualizacion(z: Zona, version: string): string {
  const datos = JSON.stringify({ limites: z.limites, zona: z.zona, nucleos: z.nucleos });
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Zona de cobertura · ${version}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#mapa{height:100%;margin:0;font-family:system-ui,sans-serif}
#nota{position:absolute;z-index:1000;top:10px;left:50px;background:#fff;padding:8px 12px;border-radius:9px;
box-shadow:0 1px 4px rgba(0,0,0,.3);font-size:14px;max-width:420px}</style></head>
<body><div id="nota"><b>Zona de cobertura · ${version}</b><br>
Azul discontinuo: zona con margen de ${MARGEN_METROS} m (aviso de fuera de zona).<br>
Naranja: términos municipales de Albolote y Calicasas. Puntos: núcleos.<br>
Comprueba que cubre todo Albolote y Calicasas.</div><div id="mapa"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const d = ${datos};
const mapa = L.map('mapa');
// Mapa base del IGN: OSM rechaza teselas pedidas desde un archivo local (sin Referer).
L.tileLayer('https://www.ign.es/wmts/ign-base?layer=IGNBaseTodo&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
  { maxZoom: 19, attribution: 'IGN-Base © Instituto Geográfico Nacional · límites © colaboradores de OpenStreetMap' }).addTo(mapa);
const zona = L.geoJSON(d.zona, { style: { color: '#28517F', weight: 2, dashArray: '9 7', fillOpacity: 0.05 } }).addTo(mapa);
L.geoJSON(d.limites, { style: { color: '#DD5A1F', weight: 2, fillOpacity: 0 },
  onEachFeature: (f, l) => l.bindTooltip(f.properties.nombre) }).addTo(mapa);
L.geoJSON(d.nucleos, { pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 6, color: '#0E1B30', fillColor: '#E97136', fillOpacity: 1 })
  .bindTooltip(f.properties.nombre + ' · ' + f.properties.municipio, { permanent: true, direction: 'right' }) }).addTo(mapa);
mapa.fitBounds(zona.getBounds());
</script></body></html>
`;
}

async function principal(): Promise<void> {
  log.paso('Zona de cobertura desde OpenStreetMap');
  const respuesta = await consultarOverpass();
  const relaciones = respuesta.elements.filter((e): e is RelacionOverpass => e.type === 'relation');
  const lugares = respuesta.elements.filter((e): e is NodoOverpass => e.type === 'node');
  const version = new Date().toISOString().slice(0, 10);

  const z = construirZona(relaciones, lugares, { margenMetros: MARGEN_METROS, tolerancia: TOLERANCIA, version });
  if (z.nucleos.features.length < 5)
    abortar(`Solo ${z.nucleos.features.length} núcleos: los datos de OSM parecen incompletos.`);

  escribir('limite-municipal.geojson', serializar(z.limites));
  escribir('zona-cobertura.geojson', serializar({ type: 'FeatureCollection', features: [z.zona] }));
  escribir('nucleos.geojson', serializar(z.nucleos));
  escribir(
    'meta.json',
    `${JSON.stringify(
      {
        version,
        datos_osm: respuesta.osm3s?.timestamp_osm_base ?? null,
        fuente: 'OpenStreetMap (ODbL), relaciones admin_level=8 por código INE',
        municipios: z.limites.features.map((f) => ({
          ine: f.properties.ine,
          municipio: f.properties.municipio,
          osm_id: f.properties.osm_id,
        })),
        margen_m: MARGEN_METROS,
        tolerancia_grados: TOLERANCIA,
        recuadro: recuadro(z.zona),
        nucleos: z.nucleos.features.length,
      },
      null,
      2,
    )}\n`,
  );
  escribir('zona-cobertura.html', htmlPrevisualizacion(z, version));
  log.info(`Núcleos: ${z.nucleos.features.map((f) => f.properties.nombre).join(', ')}`);
  log.ok('Abre datos/zona-cobertura.html para revisarla');
}

if (import.meta.main) ejecutarScript(principal);
