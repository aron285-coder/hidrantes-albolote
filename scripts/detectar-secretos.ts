// Pre-commit: aborta si lo preparado para commit contiene algo con forma de secreto (04 §11.1).
// Sin servicios externos. Una línea legítima se permite añadiendo el comentario
// `detectar-secretos:permitir` en esa misma línea (y explicándolo en el PR).

import { RAIZ, ejecutar, ejecutarScript, log } from './lib/comun.ts';

const PATRONES: [string, RegExp][] = [
  ['clave privada', /-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----/],
  ['JWT (anon/service_role de Supabase)', /eyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}/],
  ['clave secreta de Supabase', /sb_secret_[\w-]{10,}/],
  ['token de GitHub', /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  [
    'cadena de conexión con contraseña',
    // Se excluyen las credenciales locales de desarrollo y los marcadores de ejemplo.
    /postgres(ql)?:\/\/[^\s:@/]+:(?!postgres@127\.0\.0\.1|migrador-local@|(clave|contraseña|password|x)@)[^\s@$]{4,}@/,
  ],
  [
    'secreto asignado en claro',
    // El valor debe parecer un literal (termina en comilla, espacio o fin de línea), no código como
    // `sb.servicio` o `decodeURIComponent(...)`.
    /\b(SERVICE_ROLE_KEY|CLOUDFLARE_API_TOKEN|SAL_IP|VAPID_PRIVATE_KEY|DB_PASSWORD|PGPASSWORD|GITHUB_DISPATCH_TOKEN)\s*[=:]\s*['"]?[A-Za-z0-9_\-+/=]{12,}(?=['"\s,;]|$)/,
  ],
];

const ARCHIVOS_PROHIBIDOS = /(^|\/)\.env(\.(?!example$)[^/]*)?$|\.(gpg|dump|pmtiles|pem|key)$/;

export function buscarSecretos(texto: string): { linea: number; tipo: string }[] {
  const hallazgos: { linea: number; tipo: string }[] = [];
  texto.split('\n').forEach((l, i) => {
    if (l.includes('detectar-secretos:permitir')) return;
    for (const [tipo, patron] of PATRONES) if (patron.test(l)) hallazgos.push({ linea: i + 1, tipo });
  });
  return hallazgos;
}

/**
 * Un volcado de pg_dump del esquema (docs/18 RV-37): lleva en claro nombres de voluntarios, correos
 * y el hash del código, y el repositorio es público (DEC-053). Se reconoce por la cabecera de pg_dump
 * o por un bloque COPY al principio de una línea; bajo supabase/ (migraciones, tests, seed) no.
 */
export function esVolcado(ruta: string, texto: string): boolean {
  if (ruta.replaceAll('\\', '/').startsWith('supabase/')) return false;
  return /^-- PostgreSQL database dump/m.test(texto) || /^COPY hidrantes\.\w+ /m.test(texto);
}

/** El mapa base publicado es el único PMTiles que va a Git: datos públicos de OSM (DEC-062). */
const PERMITIDOS = new Set(['public/mapabase/albolote.pmtiles']);

export function archivoProhibido(ruta: string): boolean {
  return !PERMITIDOS.has(ruta.replaceAll('\\', '/')) && ARCHIVOS_PROHIBIDOS.test(ruta);
}

async function principal(): Promise<void> {
  const archivos = ejecutar('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { cwd: RAIZ })
    .salida.split('\n')
    .filter(Boolean);
  let problemas = 0;
  for (const archivo of archivos) {
    if (archivoProhibido(archivo)) {
      log.error(`${archivo}: este tipo de archivo nunca va a Git`);
      problemas++;
      continue;
    }
    // Sus propios ejemplos falsos son la única excepción por archivo.
    if (archivo === 'scripts/detectar-secretos.test.ts') continue;
    const contenido = ejecutar('git', ['show', `:${archivo}`], { cwd: RAIZ }).salida;
    if (contenido.includes(String.fromCharCode(0))) continue; // binario
    if (esVolcado(archivo, contenido)) {
      log.error(`${archivo}: parece un volcado de la base de datos (datos personales en claro): nunca va a Git`);
      problemas++;
      continue;
    }
    for (const h of buscarSecretos(contenido)) {
      log.error(`${archivo}:${h.linea}: posible ${h.tipo} (no se muestra el valor)`);
      problemas++;
    }
  }
  if (problemas > 0) {
    log.error('Commit cancelado. Quita el secreto (va en GitHub Environments o Cloudflare, 04 §10).');
    process.exit(1);
  }
  log.ok(`Sin secretos en ${archivos.length} archivos preparados`);
}

if (import.meta.main) ejecutarScript(principal);
