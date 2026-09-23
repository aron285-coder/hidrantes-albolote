// Compartir un punto o un sitio con quien no tiene la app: bomberos, el 112, otro grupo (FR-75;
// docs/18 GM-05). El texto lleva lo que sirve para llegar y nada de quién lo registró (FR-27): ni
// nombres ni la descripción libre, que la escriben voluntarios. Tampoco el enlace a esta app: quien
// lo recibe no tiene acceso. Todo sale por el menú del móvil; nada pasa por un servidor nuestro.

import { type LatLng, aUtm, dentroDelHuso, enlaceGoogleMaps, formatoDecimal, formatoUtm } from './coordenadas';
import { nombreCaudal, nombreTipo } from './ficha';
import type { Punto } from './puntos';
import { T } from './textos';

/** Coordenadas en decimal y, si caen en el huso 30, también en UTM. */
export function lineaCoordenadas(l: LatLng): string {
  const decimal = formatoDecimal(l);
  return dentroDelHuso(l) ? T.compartir.lineaCoordenadas(decimal, formatoUtm(aUtm(l), l.lat)) : decimal;
}

/** El texto de un punto, en el formato de docs/18 GM-05. */
export function textoPunto(p: Punto): string {
  const tipo = nombreTipo[p.tipo].toLowerCase();
  const estado = nombreCaudal[p.caudal].toLowerCase();
  const lugar = [p.direccion, p.nucleo ?? null].filter(Boolean).join(', ');
  return [
    T.compartir.lineaPunto(p.codigo, tipo, T.formato.mm(p.diametro_mm), estado),
    lugar,
    lineaCoordenadas(p),
    enlaceGoogleMaps(p),
  ]
    .filter(Boolean)
    .join('\n');
}

/** El texto de un sitio del mapa: la calle si se conoce, las coordenadas y el enlace. */
export function textoUbicacion(l: LatLng, calle?: string | null): string {
  return [calle ?? '', lineaCoordenadas(l), enlaceGoogleMaps(l)].filter(Boolean).join('\n');
}

export type ResultadoCompartir = 'compartido' | 'copiado' | 'cancelado' | 'fallo';

/**
 * Con el menú del móvil si lo hay; si no, al portapapeles. Cancelar el menú no es un fallo y no se
 * avisa. Si tampoco se puede copiar, 'fallo': quien llama enseña el texto para copiarlo a mano (UI-05).
 */
export async function compartir(titulo: string, texto: string): Promise<ResultadoCompartir> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav?.share) {
    try {
      await nav.share({ title: titulo, text: texto });
      return 'compartido';
    } catch (e) {
      if ((e as { name?: string } | null)?.name === 'AbortError') return 'cancelado';
      // Cualquier otro error del menú (permiso, sin gesto): se intenta copiar.
    }
  }
  return copiar(texto);
}

/** Al portapapeles; 'fallo' si el navegador no deja. */
export async function copiar(texto: string): Promise<'copiado' | 'fallo'> {
  try {
    if (!navigator.clipboard?.writeText) return 'fallo';
    await navigator.clipboard.writeText(texto);
    return 'copiado';
  } catch {
    return 'fallo';
  }
}
