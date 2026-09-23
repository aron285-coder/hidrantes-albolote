// Nombres y valores de los campos de un punto en palabras de la aplicación (UI-20, UI-21). Los
// comparten Mis propuestas (qué corrigió jefatura) y el panel (diff, fusión), para que nadie vea
// "diametro mm: 70 · racor: granada" (docs/17 RV-23). Sin nombres ni correos de nadie.

import { nombreCaudal, nombreRacor, nombreTipo } from './ficha';
import type { MotivoRapido } from './propuestas';
import { T } from './textos';
import type { Caudal, TipoPunto } from '../tipos/punto';

export const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));

export const MOTIVO_RAPIDO: Record<MotivoRapido, string> = {
  obras: T.formulario.obras,
  asfaltado: T.formulario.asfaltado,
  sustituido: T.formulario.sustituido,
  otro: T.formulario.otro,
};

/** Etiqueta de cada clave de `datos` y `correcciones` (05 §7). */
export const ETIQUETA_CAMPO: Record<string, string> = {
  tipo: T.panelCola.campoTipo,
  diametro_mm: T.panelCola.campoDiametro,
  diametro_otro: T.formulario.otraMedida,
  caudal: T.panelCola.campoEstado,
  racor: T.panelCola.campoRacor,
  descripcion_fallo: T.panelCola.campoFallo,
  descripcion: T.panelCola.campoDescripcion,
  nota: T.panelCola.campoNota,
  motivo_rapido: T.panelCola.campoMotivo,
  motivo: T.panelCola.campoMotivo,
  direccion: T.ficha.direccion,
};

export const etiquetaCampo = (campo: string) => ETIQUETA_CAMPO[campo] ?? campo;

/** El valor de un campo como se lee en pantalla. */
export function valorDe(campo: string, v: unknown): string {
  switch (campo) {
    case 'tipo':
      return nombreTipo[v as TipoPunto] ?? texto(v);
    case 'diametro_mm':
    case 'diametro_otro':
      return T.formato.mm(texto(v));
    case 'caudal':
      return nombreCaudal[v as Caudal] ?? texto(v);
    case 'racor':
      return v ? nombreRacor(texto(v)) : T.panelCola.ninguno;
    case 'motivo_rapido':
      return MOTIVO_RAPIDO[v as MotivoRapido] ?? texto(v);
    default:
      return texto(v) || T.panelCola.ninguno;
  }
}

/** "Diámetro: 70 mm · Racor: Granada". Lo que no es un campo del punto (ids internos) no sale. */
export function textoCambios(c: Record<string, unknown> | null | undefined): string | null {
  const partes = Object.entries(c ?? {})
    .filter(([k]) => k in ETIQUETA_CAMPO)
    .map(([k, v]) => `${etiquetaCampo(k)}: ${valorDe(k, v)}`);
  return partes.length ? partes.join(' · ') : null;
}
