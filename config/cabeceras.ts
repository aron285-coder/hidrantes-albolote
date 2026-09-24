// Cabeceras de seguridad de Cloudflare Pages (TR-100, 04 §14).
// Se generan en el build (`dist/_headers`) para que la CSP nombre exactamente el proyecto de
// Supabase de cada entorno, y las lee el test e2e que comprueba staging tras desplegar.

export type Entorno = 'local' | 'staging' | 'produccion';

/** Capas en línea (04 §8). Si cambian, se cambian aquí y en src/lib/capas.ts. */
export const ORIGENES_CAPAS = [
  'https://tile.openstreetmap.org', // OSM estándar
  'https://www.ign.es', // PNOA (WMTS)
  'https://ovc.catastro.meh.es', // Catastro (WMS)
];

/** Tipo MIME de las teselas vectoriales sueltas (docs/20 RV-71). */
export const TIPO_TESELA = 'application/vnd.mapbox-vector-tile';

export interface OpcionesCabeceras {
  entorno: Entorno;
  supabaseUrl?: string;
  mapabaseUrl?: string;
}

function origen(url?: string): string[] {
  if (!url) return [];
  try {
    return [new URL(url).origin];
  } catch {
    return [];
  }
}

export function politicaCsp({ supabaseUrl, mapabaseUrl }: OpcionesCabeceras): string {
  const supabase = origen(supabaseUrl);
  const mapabase = origen(mapabaseUrl);
  const directivas: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    // Leaflet y algunos componentes escriben estilos en línea; nunca scripts.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', ...supabase, ...ORIGENES_CAPAS],
    'font-src': ["'self'"],
    // Nominatim no aparece: se consulta solo desde la Pages Function (/api/direccion).
    'connect-src': ["'self'", ...supabase, ...mapabase, ...ORIGENES_CAPAS],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'frame-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };
  return Object.entries(directivas)
    .map(([k, v]) => `${k} ${[...new Set(v)].join(' ')}`)
    .join('; ');
}

export function cabecerasGenerales(opciones: OpcionesCabeceras): Record<string, string> {
  const c: Record<string, string> = {
    'Content-Security-Policy': politicaCsp(opciones),
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), bluetooth=(), serial=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
  if (opciones.entorno !== 'produccion') c['X-Robots-Tag'] = 'noindex, nofollow';
  return c;
}

/** Contenido del archivo `_headers` de Cloudflare Pages. */
export function archivoHeaders(opciones: OpcionesCabeceras): string {
  const bloque = (ruta: string, cabeceras: Record<string, string>) =>
    [ruta, ...Object.entries(cabeceras).map(([k, v]) => `  ${k}: ${v}`)].join('\n');
  return [
    '# Generado por config/cabeceras.ts en el build. No editar a mano.',
    bloque('/*', cabecerasGenerales(opciones)),
    // El Service Worker y el manifiesto no se cachean: así la versión nueva se detecta al abrir (TR-24).
    bloque('/sw.js', { 'Cache-Control': 'no-cache' }),
    bloque('/manifest.webmanifest', { 'Cache-Control': 'no-cache' }),
    bloque('/assets/*', { 'Cache-Control': 'public, max-age=31536000, immutable' }),
    // Teselas sueltas del mapa base en línea (docs/20 RV-71, DEC-111): la ruta lleva la versión, así
    // que no cambian nunca. El tipo, solo en las teselas ({z}/{x}/{y}.pbf), no en su meta.json: Pages
    // juntaría con una coma dos Content-Type de dos reglas.
    bloque('/mapabase/t/*', { 'Cache-Control': 'public, max-age=31536000, immutable' }),
    bloque('/mapabase/t/:version/:z/:x/:y', { 'Content-Type': TIPO_TESELA }),
    // El PMTiles entero solo se descarga para usarlo sin cobertura (FR-81). no-transform: ya va
    // comprimido por dentro y un rango, si Pages llegara a servirlo, no debe cambiar de bytes.
    bloque('/mapabase/albolote.pmtiles', {
      'Content-Type': 'application/vnd.pmtiles',
      'Cache-Control': 'no-transform',
    }),
    '',
  ].join('\n\n');
}

export function archivoRobots(entorno: Entorno): string {
  return entorno === 'produccion' ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nDisallow: /\n';
}
