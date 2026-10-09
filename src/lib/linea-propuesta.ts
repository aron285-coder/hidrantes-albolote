// docs/33 RV-315 (U6): en Mis propuestas, una sola línea con lo que se propuso. Sale de `datos`, lo
// mismo que se manda (05 §7), con los nombres y valores de `campos.ts` que usan también el panel y las
// correcciones de jefatura: "Regular → No funciona", "Tipo de enganche: Granada → Directo",
// "Hidrante 100 mm", "Sigue igual", "Retirada: Obras". El valor de antes solo se pone si se sabe (el
// punto guardado en el móvil, mientras la propuesta está pendiente) y es distinto.

import { etiquetaCampo, texto, valorDe } from './campos';
import type { Operacion } from './propuestas';
import { T } from './textos';
import type { Punto } from '../tipos/punto';

/** Lo que tenía el punto antes de la propuesta: los campos que `datos` puede cambiar. */
export type PuntoAntes = Partial<Pick<Punto, 'caudal' | 'racor' | 'diametro_mm' | 'descripcion'>>;

/** Los campos de "corregir datos" en el orden en que se leen. `tipo` no: solo viaja igual al de antes. */
const CAMPOS_DATOS = ['diametro_mm', 'diametro_otro', 'racor', 'descripcion'] as const;

const hay = (v: unknown) => v !== undefined && v !== null && texto(v) !== '';

/** "Regular → No funciona", o "No funciona" si no se sabe lo de antes o es lo mismo. */
function flecha(campo: string, antes: unknown, despues: unknown): string {
  const nuevo = valorDe(campo, despues);
  if (antes === undefined) return nuevo;
  const viejo = valorDe(campo, antes);
  return viejo === nuevo ? nuevo : T.misPropuestas.lineaCambio(viejo, nuevo);
}

/** La línea de una propuesta. `antes`, solo si el punto guardado sigue siendo el de antes de proponer. */
export function lineaPropuesta(operacion: Operacion, datos: unknown, antes?: PuntoAntes | null): string {
  const d =
    typeof datos === 'object' && datos !== null && !Array.isArray(datos) ? (datos as Record<string, unknown>) : {};
  switch (operacion) {
    case 'alta': {
      const medida = hay(d.diametro_mm) ? d.diametro_mm : d.diametro_otro;
      const partes = [
        hay(d.tipo) ? valorDe('tipo', d.tipo) : null,
        hay(medida) ? valorDe('diametro_mm', medida) : null,
      ];
      return partes.filter(Boolean).join(' ') || T.misPropuestas.puntoNuevo;
    }
    case 'revision':
      return T.operaciones.sigueIgual;
    case 'estado':
      return hay(d.caudal) ? flecha('caudal', antes?.caudal, d.caudal) : T.operaciones.etiquetaEstado;
    case 'datos': {
      const partes = CAMPOS_DATOS.filter((k) => Object.hasOwn(d, k)).map((k) => {
        // La otra medida de una boca es su diámetro: se lee como tal, con el de antes.
        const campo = k === 'diametro_otro' ? 'diametro_mm' : k;
        return T.misPropuestas.lineaCampo(etiquetaCampo(campo), flecha(campo, antes?.[campo], d[k]));
      });
      return partes.length ? partes.join(' · ') : T.operaciones.corregirDatos;
    }
    case 'ubicacion':
      return T.misPropuestas.lineaUbicacion;
    case 'retirada': {
      // Con "Otro" (o sin motivo rápido), el motivo escrito dice más que "Otro".
      const escrito = (d.motivo_rapido === 'otro' || !hay(d.motivo_rapido)) && hay(d.motivo);
      if (escrito) return T.misPropuestas.lineaRetirada(texto(d.motivo));
      if (hay(d.motivo_rapido)) return T.misPropuestas.lineaRetirada(valorDe('motivo_rapido', d.motivo_rapido));
      return T.operaciones.etiquetaRetirada;
    }
  }
}
