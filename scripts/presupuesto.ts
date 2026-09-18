// TR-11: el JavaScript que carga la primera pantalla pesa < 300 kB comprimido (gzip).
// Mide el script de entrada y los modulepreload de dist/index.html. Falla el CI si se supera.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { RAIZ, abortar, ejecutarScript, log } from './lib/comun.ts';

const LIMITE_KB = 300;

async function principal(): Promise<void> {
  const dist = path.join(RAIZ, 'dist');
  const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
  const rutas = [
    ...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g),
    ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g),
  ].map((m) => m[1]);
  if (rutas.length === 0) abortar('No encuentro el script de entrada en dist/index.html. ¿Has hecho npm run build?');

  let total = 0;
  for (const ruta of new Set(rutas)) {
    const kb = gzipSync(readFileSync(path.join(dist, ruta))).length / 1024;
    total += kb;
    log.info(`${ruta}: ${kb.toFixed(1)} kB gzip`);
  }
  if (total > LIMITE_KB) abortar(`JavaScript inicial ${total.toFixed(1)} kB > ${LIMITE_KB} kB (TR-11)`);
  log.ok(`JavaScript inicial ${total.toFixed(1)} kB ≤ ${LIMITE_KB} kB (TR-11)`);
}

ejecutarScript(principal);
