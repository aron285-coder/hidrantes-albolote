// Códigos de error de 05 §8 en palabras de jefatura (TR-36, UI-04): qué pasó y qué hacer.

import { SIN_SERVIDOR } from '../api';
import { T } from '../textos';

export function textoError(codigo: string): string {
  const base = codigo.replace(/\(.*$/, '');
  switch (base) {
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
    default:
      return T.panelErrores.generico;
  }
}
