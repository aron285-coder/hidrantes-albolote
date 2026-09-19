// Tipos del punto tal como llega de v_puntos_activos (05 §4). Sin imports: también los usan los e2e.

export type TipoPunto = 'hidrante' | 'boca_riego';
export type Caudal = 'bueno' | 'regular' | 'malo' | 'no_funciona';
export type Racor = 'granada' | 'barcelona' | 'otro';

/** Una fila de v_puntos_activos (05 §4). */
export interface Punto {
  id: string;
  codigo: string;
  tipo: TipoPunto;
  diametro_mm: number;
  caudal: Caudal;
  racor: Racor | null;
  descripcion_fallo: string | null;
  descripcion: string | null;
  direccion: string | null;
  foto_path: string | null;
  municipio: string;
  nucleo: string | null;
  fecha_ultima_revision: string;
  actualizado_en: string;
  lat: number;
  lng: number;
  radio_px: number;
  revision_caducada: boolean;
}
