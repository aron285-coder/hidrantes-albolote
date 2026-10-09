// Nombres de las operaciones y de los errores de envío para la interfaz (TR-36).

import { type EnCola, esperaTope } from './cola';
import { aLaHora } from './formato';
import type { Operacion } from './propuestas';
import { T } from './textos';

/** Título de la pantalla de cada operación. */
export const TITULO_OPERACION: Record<Operacion, string> = {
  alta: T.navegacion.nuevoPunto,
  revision: T.operaciones.sigueIgual,
  estado: T.operaciones.actualizarEstado,
  datos: T.operaciones.corregirDatos,
  ubicacion: T.operaciones.corregirUbicacion,
  retirada: T.operaciones.proponerRetirada,
};

/** Etiqueta corta en Mis propuestas. */
export const ETIQUETA_OPERACION: Record<Operacion, string> = {
  alta: T.operaciones.etiquetaAlta,
  revision: T.operaciones.etiquetaRevision,
  estado: T.operaciones.etiquetaEstado,
  datos: T.operaciones.etiquetaDatos,
  ubicacion: T.operaciones.etiquetaUbicacion,
  retirada: T.operaciones.etiquetaRetirada,
};

/**
 * Por qué espera un envío sin ser un error (docs/31 RV-154, docs/32 RV-233): el tope y a qué hora se
 * vuelve a intentar. Null si no hay nada que decir, también si la hora ya ha pasado.
 */
export function textoEspera(envio: Pick<EnCola, 'en_espera' | 'fallo' | 'proximo'>, ahora = Date.now()): string | null {
  if (!envio.en_espera || !esperaTope(envio, ahora)) return null;
  const { motivo, maximo } = envio.en_espera;
  const cuando = aLaHora(envio.proximo, ahora);
  switch (motivo) {
    case 'cuota_propuestas':
      return maximo ? T.misPropuestas.cuotaPropuestas(maximo) : T.misPropuestas.cuotaPropuestasSinNumero;
    case 'cuota_propuestas_nuevo':
      return maximo
        ? T.misPropuestas.esperaPropuestasNuevo(maximo, cuando)
        : T.misPropuestas.esperaPropuestasNuevoSinNumero(cuando);
    case 'cuota_propuestas_grupo':
      return T.misPropuestas.esperaPropuestasGrupo(cuando);
    case 'cuota_fotos':
      // docs/33 RV-329: «tu máximo» si el servidor dijo que el tope es el de este móvil.
      return envio.en_espera.ambito === 'dispositivo'
        ? T.misPropuestas.esperaFotosDispositivo(cuando)
        : T.misPropuestas.esperaFotos(cuando);
    case 'cuota_fotos_grupo':
      return T.misPropuestas.esperaFotosGrupo(cuando);
    case 'sin_espacio_fotos':
      return T.misPropuestas.esperaSinEspacioFotos(cuando);
    case 'sin_espacio':
      return T.misPropuestas.esperaSinEspacio(cuando);
    case 'reservas_abiertas':
      return T.misPropuestas.esperaReservas(cuando);
    default:
      return null;
  }
}

/** Error permanente de la cola en palabras del voluntario. */
export function textoFallo(codigo: string): string {
  if (codigo.startsWith('PUNTO_NO')) return T.misPropuestas.errorNoActivo;
  if (codigo.startsWith('FOTO_SITIO_OBLIGATORIA')) return T.misPropuestas.errorFotoSitio;
  if (codigo.startsWith('FOTO')) return T.misPropuestas.errorFoto;
  if (codigo.startsWith('TIPO_NO_MODIFICABLE')) return T.misPropuestas.errorTipo;
  if (codigo.startsWith('PAYLOAD')) return T.misPropuestas.errorDatos;
  return T.misPropuestas.errorGenerico;
}
