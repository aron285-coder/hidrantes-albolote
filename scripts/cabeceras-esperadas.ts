// docs/37 RV-490 (DEC-210): el `_headers` que tiene que traer dist, generado desde el repositorio con las
// mismas variables públicas que usó «construir» (VITE_ENTORNO, VITE_SUPABASE_URL, VITE_MAPABASE_URL).
// Lo compara .github/scripts/comprobar-dist.sh, byte a byte, en «desplegar». Solo importa
// config/cabeceras.ts, que no importa nada: corre con `node` y sin node_modules (DEC-198).
//
//   VITE_ENTORNO=produccion VITE_SUPABASE_URL=… VITE_MAPABASE_URL=… node scripts/cabeceras-esperadas.ts

import { type Entorno, archivoHeaders } from '../config/cabeceras.ts';

const entorno = process.env.VITE_ENTORNO as Entorno;
if (!['local', 'staging', 'produccion'].includes(entorno)) {
  process.stderr.write(`VITE_ENTORNO no válido: ${entorno}\n`);
  process.exit(2);
}
// Como vite.config.ts: una variable vacía cuenta como no puesta (config/cabeceras.ts no la añade a la CSP).
process.stdout.write(
  archivoHeaders({
    entorno,
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    mapabaseUrl: process.env.VITE_MAPABASE_URL,
  }),
);
