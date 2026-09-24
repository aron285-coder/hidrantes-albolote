// Consultas a Overpass (OpenStreetMap) para la zona (FR-53) y el callejero (FR-73, DEC-093): los
// mismos servidores y el mismo User-Agent. Solo a mano o en Mantenimiento; nunca en el build de CI.

import { abortar, log } from './comun.ts';

export const ESPEJOS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
export const AGENTE = 'hidrantes-albolote/1.0 (+https://github.com/aron285-coder/hidrantes-albolote)';

export interface RespuestaOverpass<E> {
  osm3s?: { timestamp_osm_base?: string };
  elements: E[];
}

/**
 * Prueba cada espejo en orden. Un servidor ocupado responde a veces 200 con una página de error en
 * XML: sin `elements`, cuenta como caído y se pasa al siguiente.
 */
export async function consultarOverpass<E>(consulta: string, siFalla: string): Promise<RespuestaOverpass<E>> {
  for (const url of ESPEJOS) {
    try {
      log.info(`Overpass: ${new URL(url).host}`);
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': AGENTE, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: consulta }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const datos = (await r.json()) as RespuestaOverpass<E>;
      if (!Array.isArray(datos.elements)) throw new Error('respuesta sin elements');
      return datos;
    } catch (e) {
      log.aviso(`${new URL(url).host} no respondió (${(e as Error).message}); pruebo el siguiente`);
    }
  }
  abortar(`Ningún servidor Overpass respondió. ${siFalla}`);
}
