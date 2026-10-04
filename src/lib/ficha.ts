// Datos derivados de la ficha (FR-66, FR-161): URL de la foto, enlace "Cómo llegar" y nombres.

import { caudalParaDibujar, esCaudalConocido } from './caudal';
import { ENTORNO } from './entorno';
import type { Caudal, Punto, TipoPunto } from './puntos';
import { T } from './textos';

/** Bucket de fotos del entorno (04 §7): producción el suyo; staging y local, el de dev. */
export const BUCKET_FOTOS = ENTORNO === 'produccion' ? 'hidrantes-fotos' : 'hidrantes-fotos-dev';

/** Lectura pública por ruta no enumerable (DEC-011). */
export function urlFoto(fotoPath: string | null, base = import.meta.env.VITE_SUPABASE_URL): string | null {
  if (!fotoPath || !base) return null;
  return `${base}/storage/v1/object/public/${BUCKET_FOTOS}/${fotoPath.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * "Cómo llegar": abre la app de mapas del móvil con el punto de destino. No se calculan rutas.
 * Android → geo:, iPhone/iPad → Apple Plans, el resto → Google Maps web.
 */
export function enlaceComoLlegar(p: Pick<Punto, 'lat' | 'lng' | 'codigo'>, agente = navigator.userAgent): string {
  const coords = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  if (/android/i.test(agente)) return `geo:${coords}?q=${coords}(${encodeURIComponent(p.codigo)})`;
  if (/iphone|ipad|ipod|macintosh.*mobile/i.test(agente)) return `https://maps.apple.com/?daddr=${coords}&dirflg=d`;
  return `https://www.google.com/maps/dir/?api=1&destination=${coords}`;
}

const NOMBRE_CAUDAL: Record<Caudal, string> = {
  bueno: T.formulario.bueno,
  regular: T.formulario.regular,
  malo: T.formulario.malo,
  barro: T.formulario.barro,
  no_funciona: T.formulario.noFunciona,
};

/**
 * El nombre del estado. Uno que esta versión no conoce se lee «Estado desconocido · actualiza la
 * aplicación» (docs/24 RV-102a); la llamada anota el error una vez por sesión.
 */
export function nombreCaudal(c: string): string {
  if (esCaudalConocido(c)) return NOMBRE_CAUDAL[c];
  caudalParaDibujar(c);
  return T.ficha.estadoDesconocido;
}

export const nombreTipo: Record<TipoPunto, string> = {
  hidrante: T.formulario.hidrante,
  boca_riego: T.formulario.bocaRiego,
};

export const nombreRacor = (r: string) =>
  r === 'granada' ? T.formulario.granada : r === 'barcelona' ? T.formulario.barcelona : T.formulario.otro;

const CLASE_CHIP: Record<Caudal, string> = {
  bueno: 'bg-verde-100 text-verde-700',
  regular: 'bg-amarillo-100 text-amarillo-800',
  malo: 'bg-rojo-100 text-rojo-700',
  barro: 'bg-marron-100 text-marron-700',
  no_funciona: 'bg-gris-100 text-gris-700',
};

/** Chip de estado (06 §5): fondo y texto de su color. Uno desconocido, como no funciona. */
export const claseChip = (c: string): string => CLASE_CHIP[caudalParaDibujar(c)];
