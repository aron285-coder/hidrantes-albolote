// Códigos de error de 05 §8 en palabras de jefatura (TR-36, UI-04): qué pasó y qué hacer.

import { SIN_SERVIDOR } from '../api';
import { T } from '../textos';

export function textoError(codigo: string): string {
  if (codigo === 'PAYLOAD_INVALIDO(dispositivo)') return T.panelErrores.dispositivoAmbiguo;
  const base = codigo.replace(/\(.*$/, '');
  switch (base) {
    case 'DISPOSITIVO_NO_ENCONTRADO':
      return T.panelErrores.dispositivoNoEncontrado;
    case 'PROPUESTA_NO_PENDIENTE':
      return T.panelErrores.yaResuelta;
    case 'PUNTO_NO_ACTIVO':
      return T.panelErrores.puntoNoActivo;
    case 'PROPUESTA_DESACTUALIZADA':
      return T.panelErrores.desactualizada;
    case 'DIAMETRO_SIN_FIJAR':
      return T.panelCola.fijaDiametro;
    case 'MOTIVO_OBLIGATORIO':
      return T.panelErrores.motivo;
    case 'TIPO_DISTINTO':
      return T.panelErrores.tipoDistinto;
    case 'PROPUESTA_NO_ALTA':
      return T.panelErrores.soloAltas;
    case 'FOTO_SITIO_OBLIGATORIA':
      return T.panelErrores.fotoSitio;
    case 'PAYLOAD_INVALIDO':
      return T.panelErrores.datos;
    case 'FUERA_DE_PLAZO_PAPELERA':
      return T.panelErrores.fueraDePlazo;
    case 'CODIGO_FORMATO':
      return T.panelErrores.codigoFormato;
    case 'ULTIMO_ADMINISTRADOR':
      return T.panel.ultimoAdministrador;
    case 'CONFIG_INVALIDA':
      return T.panelErrores.config;
    case 'NO_AUTORIZADO':
      return T.panelErrores.noAutorizado;
    case 'NO_CONFIGURADO':
      return T.panelErrores.noConfigurado;
    case SIN_SERVIDOR:
      return T.panelErrores.sinServidor;
    case 'PUNTO_OCUPADO':
      return T.panelErrores.puntoOcupado;
    case 'TIPO_NO_MODIFICABLE':
      return T.panelErrores.tipoNoModificable;
    // docs/31 RV-146: /api/lanzar-workflow en staging, y un trabajo que ya está pedido.
    case 'SOLO_EN_PRODUCCION':
      return T.panelErrores.soloEnProduccion;
    case 'YA_PEDIDO':
      return T.panelErrores.yaPedido;
    default:
      return T.panelErrores.generico;
  }
}
