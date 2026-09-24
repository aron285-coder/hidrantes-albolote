// TR-11: el JavaScript que carga la primera pantalla pesa < 300 kB comprimido (gzip).
// Mide el script de entrada y los modulepreload de dist/index.html. Falla el CI si se supera.
// TR-103: además, la pantalla de entrada no carga el mapa ni las pantallas con sesión. Si vuelven al
// JavaScript inicial, Lighthouse se queda justo en el umbral de rendimiento (el FCP pasa de 3 s).

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { RAIZ, abortar, ejecutarScript, log } from './lib/comun.ts';

const LIMITE_KB = 300;

/** Lo único de src/paginas que puede ir en el JavaScript inicial: lo que se ve sin sesión. */
const PAGINAS_SIN_SESION = ['Entrada', 'Legal', 'NoAutorizado'];
const LIBRERIAS_DEL_MAPA = ['leaflet', 'protomaps-leaflet', '@protomaps/basemaps'];

/**
 * De las fuentes de los mapas de código del JavaScript inicial, las que no deberían estar ahí: las
 * librerías del mapa y las pantallas con sesión, que van en la porción de App.tsx (RutasDentro).
 */
export function fuentesFueraDeSitio(fuentes: string[]): string[] {
  const malas = fuentes.filter((f) => {
    const n = f.replace(/\\/g, '/');
    const libreria = n.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1];
    if (libreria) return LIBRERIAS_DEL_MAPA.includes(libreria);
    const pagina = n.match(/(?:^|\/)src\/paginas\/([^/.]+)\.tsx?$/)?.[1];
    return pagina !== undefined && !PAGINAS_SIN_SESION.includes(pagina);
  });
  return [...new Set(malas)].sort();
}

/** Scripts de la primera pantalla: el de entrada y sus modulepreload. */
export function scriptsIniciales(html: string): string[] {
  const rutas = [
    ...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g),
    ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g),
  ].map((m) => m[1]);
  return [...new Set(rutas)];
}

async function principal(): Promise<void> {
  const dist = path.join(RAIZ, 'dist');
  const rutas = scriptsIniciales(readFileSync(path.join(dist, 'index.html'), 'utf8'));
  if (rutas.length === 0) abortar('No encuentro el script de entrada en dist/index.html. ¿Has hecho npm run build?');

  let total = 0;
  const fuentes: string[] = [];
  for (const ruta of rutas) {
    const archivo = path.join(dist, ruta);
    const kb = gzipSync(readFileSync(archivo)).length / 1024;
    total += kb;
    log.info(`${ruta}: ${kb.toFixed(1)} kB gzip`);
    if (!existsSync(`${archivo}.map`)) abortar(`Falta ${ruta}.map: el build debe generar los mapas de código.`);
    fuentes.push(...(JSON.parse(readFileSync(`${archivo}.map`, 'utf8')) as { sources: string[] }).sources);
  }
  if (total > LIMITE_KB) abortar(`JavaScript inicial ${total.toFixed(1)} kB > ${LIMITE_KB} kB (TR-11)`);
  log.ok(`JavaScript inicial ${total.toFixed(1)} kB ≤ ${LIMITE_KB} kB (TR-11)`);

  const malas = fuentesFueraDeSitio(fuentes);
  if (malas.length) {
    abortar(
      `La pantalla de entrada carga el mapa o pantallas con sesión (TR-103). Impórtalas desde ` +
        `src/paginas/RutasDentro.tsx, no desde App.tsx ni main.tsx:\n  ${malas.join('\n  ')}`,
    );
  }
  log.ok('La pantalla de entrada no carga el mapa ni las pantallas con sesión (TR-103)');
}

if (import.meta.main) ejecutarScript(principal);
