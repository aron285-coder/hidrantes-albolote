// Nombres de las operaciones y de los errores de envío para la interfaz (TR-36).

import type { EnCola } from './cola';
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

/** Por qué espera un envío sin ser un error (docs/31 RV-154); null si no hay nada que decir. */
export function textoEspera(envio: Pick<EnCola, 'en_espera' | 'fallo'>): string | null {
  if (envio.fallo || envio.en_espera?.motivo !== 'cuota_propuestas') return null;
  const { maximo } = envio.en_espera;
  return maximo ? T.misPropuestas.cuotaPropuestas(maximo) : T.misPropuestas.cuotaPropuestasSinNumero;
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
