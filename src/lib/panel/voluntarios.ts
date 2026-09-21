// Voluntarios e incidencias del panel (FR-130–FR-132, FL-27). La actividad no es un ranking
// público: vive solo aquí. La supresión se hace por dispositivo, nunca por nombre (FR-131, 11 §7).

import { type Resultado, rpc } from '../api';
import { leerLista } from './consultas';
import { sinAcentos } from './cola';

export interface Actividad {
  autor: string;
  dispositivo_id: string;
  propuestas: number;
  aprobadas: number;
  rechazadas: number;
  tasa: number | null;
  ultima: string;
}

/** Periodos de FR-130. */
export const MESES: number[] = [3, 12];

export async function cargarActividad(meses: number): Promise<Resultado<Actividad[]>> {
  const r = await rpc<Actividad[]>('fn_actividad_voluntarios', { meses });
  if (!r.ok) return r;
  return { ok: true, datos: Array.isArray(r.datos) ? r.datos : [] };
}

export const anonimizar = (dispositivoId: string) =>
  rpc<number>('fn_anonimizar_autor', { dispositivo_id: dispositivoId });

/** Tasa de aprobación en porcentaje entero, o null si aún no se ha resuelto ninguna. */
export const porcentaje = (tasa: number | null) => (tasa == null ? null : Math.round(Number(tasa) * 100));

/** Por debajo de esto, conviene explicar mejor el formulario (FR-130). */
export const TASA_BAJA = 70;

export const filtrarActividad = (filas: Actividad[], busqueda: string) => {
  const t = sinAcentos(busqueda.trim());
  return t ? filas.filter((f) => sinAcentos(f.autor).includes(t)) : filas;
};

export interface Incidencia {
  id: string;
  momento: string;
  descripcion: string;
  version_app: string | null;
  ruta: string | null;
  estado: 'abierta' | 'resuelta';
  resuelta_por: string | null;
  resuelta_en: string | null;
}

export const cargarIncidencias = () =>
  leerLista<Incidencia>((c) =>
    c
      .from('incidencias_app')
      .select('id, momento, descripcion, version_app, ruta, estado, resuelta_por, resuelta_en')
      .order('momento', { ascending: false })
      .limit(200),
  );

export const resolverIncidencia = (id: string) => rpc<null>('fn_resolver_incidencia', { incidencia_id: id });
