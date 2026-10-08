// Cola de revisión del panel (FR-100–FR-110, FL-21–FL-23): qué hay pendiente, qué cambia cada
// propuesta (diff), qué señales de fiabilidad tiene y las acciones de jefatura (05 §6.2).
// Lo que se calcula aquí no toca la red y tiene tests; las acciones devuelven Resultado.

import { type Resultado, rpc } from '../api';
import { ETIQUETA_CAMPO, MOTIVO_RAPIDO, etiquetaCampo, texto, valorDe } from '../campos';
import { type LatLng, aUtm, dentroDelHuso, formatoDecimal, formatoUtm } from '../coordenadas';
import { distancia, fechaCorta, hace } from '../formato';
import type { MotivoRapido, Operacion } from '../propuestas';
import { type Caudal, type Punto, type Racor, type TipoPunto, metros, sincronizar } from '../puntos';
import { T } from '../textos';
import { funcion, leerLista } from './consultas';

export { etiquetaCampo } from '../campos';
import { pedirEnvioComoJefatura } from './push-jefatura';

export type EstadoModeracion = 'pendiente' | 'aprobada' | 'rechazada' | 'retirada_por_autor';

/** La fila actual del punto que trae la cola desde 0036 (DEC-160). Nunca autores (FR-27). */
export interface PuntoCola {
  codigo: string;
  tipo: TipoPunto;
  diametro_mm: number | null;
  caudal: Caudal;
  racor: Racor | null;
  descripcion: string | null;
  descripcion_fallo: string | null;
  direccion: string | null;
  nucleo: string | null;
  fecha_ultima_revision: string | null;
  foto_path: string | null;
  foto_sitio_path: string | null;
  /** 0036: si el punto ya no está activo (retirado, o en la papelera con `borrado_en`). */
  situacion?: 'activo' | 'retirado' | 'borrado';
  borrado_en?: string | null;
}

/** Una propuesta tal como la ve el panel: fila de v_cola_revision o, en el historial, de propuestas. */
export interface PropuestaPanel {
  id: string;
  operacion: Operacion;
  estado: EstadoModeracion;
  creada_en: string;
  autor_nombre: string;
  autor_apellido: string;
  punto_id: string | null;
  codigo: string | null;
  datos: Record<string, unknown>;
  foto_path: string | null;
  direccion_sugerida: string | null;
  direccion_actual: string | null;
  lat: number | null;
  lng: number | null;
  antes: Record<string, unknown> | null;
  origen_ubicacion: 'gps' | 'manual' | null;
  precision_gps_m: number | null;
  distancia_gps_m: number | null;
  distancia_exif_m: number | null;
  fuera_de_zona: boolean | null;
  meses_desde_revision: number | null;
  duplicado_de: string | null;
  distancia_duplicado_m: number | null;
  codigo_duplicado: string | null;
  otra_medida: boolean;
  desactualizada: boolean;
  /** 0035 (docs/24 RV-103): la foto del sitio que trae, la que tiene el punto y si falta en un alta o ubicación. */
  foto_sitio_path?: string | null;
  foto_sitio_path_actual?: string | null;
  sin_foto_sitio?: boolean;
  nucleo: string | null;
  punto_actualizado_en: string | null;
  /** 0035: el tipo y las fotos que tiene ahora el punto (null en un alta). */
  tipo_actual?: TipoPunto | null;
  foto_path_actual?: string | null;
  /**
   * 0036 (docs/25 RV-110, DEC-160): la fila actual del punto y su posición. Opcionales: el panel
   * sigue funcionando contra la vista de antes, con los datos del inventario cargado (DEC-159).
   */
  punto?: PuntoCola | null;
  punto_lat?: number | null;
  punto_lng?: number | null;
  // solo en el historial
  motivo_rechazo?: string | null;
  correcciones?: Record<string, unknown> | null;
  revisada_por?: string | null;
  revisada_en?: string | null;
}

// ---------- lecturas ----------

export function cargarCola(): Promise<Resultado<PropuestaPanel[]>> {
  return leerLista<PropuestaPanel>((c) =>
    c.from('v_cola_revision').select('*').order('creada_en', { ascending: false }),
  );
}

/** Una fila de v_historial_revision (0036, DEC-160): lo decidido, sin señales ni `antes`. */
interface FilaHistorial {
  id: string;
  operacion: Operacion;
  estado: EstadoModeracion;
  creada_en: string;
  autor_nombre: string;
  autor_apellido: string;
  punto_id: string | null;
  codigo: string | null;
  datos: Record<string, unknown> | null;
  foto_path: string | null;
  foto_sitio_path: string | null;
  direccion_sugerida: string | null;
  direccion_actual: string | null;
  lat: number | null;
  lng: number | null;
  origen_ubicacion: 'gps' | 'manual' | null;
  precision_gps_m: number | null;
  nucleo: string | null;
  motivo_rechazo: string | null;
  correcciones: Record<string, unknown> | null;
  revisada_por: string | null;
  revisada_en: string | null;
  punto: PuntoCola | null;
  punto_lat: number | null;
  punto_lng: number | null;
}

/** Cuántas decididas se traen: el historial completo está en el Registro (FR-123). */
export const LIMITE_HISTORIAL = 300;

/** Historial de lo decidido (FR-109): solo lectura, con quién, cuándo y el motivo o las correcciones. */
export async function cargarHistorial(
  estado: Exclude<EstadoModeracion, 'pendiente'>,
): Promise<Resultado<PropuestaPanel[]>> {
  const r = await leerLista<FilaHistorial>((c) =>
    c
      .from('v_historial_revision')
      .select('*')
      .eq('estado', estado)
      .order('revisada_en', { ascending: false, nullsFirst: false })
      .order('creada_en', { ascending: false })
      .limit(LIMITE_HISTORIAL),
  );
  if (!r.ok) return r;
  return { ok: true, datos: r.datos.map(desdeHistorial) };
}

export function desdeHistorial(f: FilaHistorial): PropuestaPanel {
  return {
    id: f.id,
    operacion: f.operacion,
    estado: f.estado,
    creada_en: f.creada_en,
    autor_nombre: f.autor_nombre,
    autor_apellido: f.autor_apellido,
    punto_id: f.punto_id,
    codigo: f.codigo ?? f.punto?.codigo ?? null,
    datos: f.datos ?? {},
    foto_path: f.foto_path,
    foto_sitio_path: f.foto_sitio_path,
    direccion_sugerida: f.direccion_sugerida,
    direccion_actual: f.direccion_actual ?? f.punto?.direccion ?? null,
    lat: f.lat,
    lng: f.lng,
    // Sin `antes`: el punto de hoy ya no es el de entonces (05, v_historial_revision).
    antes: null,
    origen_ubicacion: f.origen_ubicacion,
    precision_gps_m: f.precision_gps_m,
    distancia_gps_m: null,
    distancia_exif_m: null,
    fuera_de_zona: null,
    meses_desde_revision: null,
    duplicado_de: null,
    distancia_duplicado_m: null,
    codigo_duplicado: null,
    otra_medida: false,
    desactualizada: false,
    nucleo: f.nucleo ?? f.punto?.nucleo ?? null,
    punto_actualizado_en: null,
    punto: f.punto,
    punto_lat: f.punto_lat,
    punto_lng: f.punto_lng,
    motivo_rechazo: f.motivo_rechazo,
    correcciones: f.correcciones,
    revisada_por: f.revisada_por,
    revisada_en: f.revisada_en,
  };
}

// ---------- lo que se ve de cada propuesta ----------

export const autor = (p: Pick<PropuestaPanel, 'autor_nombre' | 'autor_apellido'>) =>
  [p.autor_nombre, p.autor_apellido].filter(Boolean).join(' ');

/** Dirección que se enseña en la lista: la del punto, o la deducida para un alta. */
export const direccionDe = (p: PropuestaPanel) => p.direccion_actual ?? p.direccion_sugerida;

/** "Autor · hace 2 h · C/ Real 14 · Albolote" (UI-11). */
export function lineaCola(p: PropuestaPanel, ahora = new Date()): string {
  return [
    autor(p),
    hace(p.creada_en, ahora),
    direccionDe(p) ?? T.ficha.sinDireccion,
    p.nucleo ?? (p.fuera_de_zona ? T.panelCola.fueraDeZona : T.panelCola.sinNucleo),
  ].join(' · ');
}

/**
 * ¿Lleva el ⚠ en la lista? Solo por lo que el detalle enseña como aviso (DEC-166): desactualizada, un
 * hidrante de otra medida, posible duplicado o fuera de zona.
 */
export const tieneAviso = (p: PropuestaPanel) =>
  p.desactualizada || bloqueoPorMedida(p) !== null || !!p.duplicado_de || !!p.fuera_de_zona;

/** Búsqueda global (FR-145): código, dirección o nombre de quien propuso. */
export function coincide(p: PropuestaPanel, texto: string): boolean {
  const t = sinAcentos(texto.trim());
  if (!t) return true;
  return sinAcentos([p.codigo, autor(p), direccionDe(p), p.nucleo].filter(Boolean).join(' ')).includes(t);
}

export const sinAcentos = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const entreComillas = (v: unknown) => `"${texto(v)}"`;

/** ¿Tiene pin (y por tanto minimapa y dirección deducida editable)? (FR-103, FR-105) */
export const conUbicacion = (p: PropuestaPanel) =>
  (p.operacion === 'alta' || p.operacion === 'ubicacion') && p.lat != null && p.lng != null;

// ---------- el detalle completo: mapa, datos del punto y fotos (docs/25 RV-110, DEC-158) ----------

/** El punto de hoy: la columna `punto` de 0036 o, con la vista de antes, el del inventario (DEC-159). */
export function puntoActual(p: PropuestaPanel, inventario?: Punto): PuntoCola | null {
  if (p.punto) return p.punto;
  if (!inventario) return null;
  return {
    codigo: inventario.codigo,
    tipo: inventario.tipo,
    diametro_mm: inventario.diametro_mm,
    caudal: inventario.caudal,
    racor: inventario.racor,
    descripcion: inventario.descripcion,
    descripcion_fallo: inventario.descripcion_fallo,
    direccion: inventario.direccion,
    nucleo: inventario.nucleo,
    fecha_ultima_revision: inventario.fecha_ultima_revision,
    foto_path: inventario.foto_path,
    foto_sitio_path: inventario.foto_sitio_path ?? null,
  };
}

/** Dónde está hoy el punto: `punto_lat`/`punto_lng` de 0036 o, si no vienen, el inventario. */
export function posicionActual(p: PropuestaPanel, inventario?: Punto): LatLng | null {
  if (p.punto_lat != null && p.punto_lng != null) return { lat: p.punto_lat, lng: p.punto_lng };
  return inventario ? { lat: inventario.lat, lng: inventario.lng } : null;
}

export type ClaveCampo =
  | 'situacion'
  | 'codigo'
  | 'tipo'
  | 'diametro_mm'
  | 'caudal'
  | 'racor'
  | 'descripcion'
  | 'descripcion_fallo'
  | 'direccion'
  | 'nucleo'
  | 'wgs84'
  | 'utm'
  | 'revision'
  | 'origen'
  | 'autor'
  | 'motivo'
  | 'nota';

/** Un campo de "Datos del punto": su valor y, si la propuesta lo cambia, el de antes. */
export interface CampoFicha {
  clave: ClaveCampo;
  etiqueta: string;
  valor: string;
  antes?: string;
  cambia: boolean;
  /** Un valor que aún no existe ("se asigna al aprobar"): se lee en gris. */
  suave?: boolean;
  /** El estado resultante, para pintar su chip (06 §5). */
  caudal?: string;
}

export interface FichaCompleta {
  campos: CampoFicha[];
  /** Cuántos campos cambian (en un alta, cuántos datos puso el voluntario). */
  cambios: number;
  alta: boolean;
}

const coordenadasDe = (l: LatLng | null): [string, string] =>
  l
    ? [formatoDecimal(l), dentroDelHuso(l) ? formatoUtm(aUtm(l), l.lat) : T.panelCola.sinDato]
    : [T.panelCola.sinDato, T.panelCola.sinDato];

/**
 * Todos los datos del punto, no solo los cambios (RV-110): lo que cambia primero y marcado, con su
 * antes y su después; después las notas (nota, motivo); y el resto sin marcar, en el orden fijo de
 * la lista. En un alta se marcan solo los datos que puso el voluntario: lo que deduce el sistema
 * (coordenadas, dirección, núcleo) va sin marcar, y el código y la revisión se fijan al aprobar.
 */
export function fichaCompleta(p: PropuestaPanel, inventario?: Punto): FichaCompleta {
  const a = puntoActual(p, inventario);
  const d = p.datos ?? {};
  const antes = p.antes ?? {};
  const op = p.operacion;
  const alta = op === 'alta';
  const sinDato = T.panelCola.sinDato;
  // El antes de un campo: lo que trae la propuesta (calculado al proponer) o, si no, el punto de hoy.
  // Decidida, el punto de hoy ya lleva el cambio: solo vale el antes que trae la propia propuesta.
  const pendiente = p.estado === 'pendiente';
  const antesDe = (campo: string, actual: unknown) => {
    const v = campo in antes ? antes[campo] : pendiente ? actual : undefined;
    return v == null || v === '' ? undefined : valorDe(campo, v);
  };
  const propone = (campo: string) => op === 'datos' && campo in d;
  const resto: CampoFicha[] = [];
  const extras: CampoFicha[] = [];
  const poner = (c: Omit<CampoFicha, 'cambia'> & { cambia?: boolean }) => resto.push({ cambia: false, ...c });

  if (op === 'retirada') {
    poner({
      clave: 'situacion',
      etiqueta: T.panelCola.campoSituacion,
      antes: T.panelCola.activo,
      valor: T.panelCola.retirado,
      cambia: true,
    });
    extras.push({
      clave: 'motivo',
      etiqueta: T.panelCola.campoMotivo,
      valor:
        [MOTIVO_RAPIDO[d.motivo_rapido as MotivoRapido], texto(d.motivo) && entreComillas(d.motivo)]
          .filter(Boolean)
          .join(' · ') || sinDato,
      cambia: false,
    });
  }
  // Un punto que ya no está activo se dice arriba: aprobar sobre él fallaría (PUNTO_NO_ACTIVO).
  if (op !== 'retirada' && a?.situacion && a.situacion !== 'activo') {
    extras.push({
      clave: 'situacion',
      etiqueta: T.panelCola.campoSituacion,
      valor: a.situacion === 'borrado' ? T.panelCola.papelera : T.panelCola.retirado,
      cambia: false,
    });
  }
  if (texto(d.nota)) {
    extras.push({ clave: 'nota', etiqueta: T.panelCola.campoNota, valor: entreComillas(d.nota), cambia: false });
  }

  poner(
    alta
      ? { clave: 'codigo', etiqueta: T.panelCola.campoCodigo, valor: T.panelCola.seAsignaAlAprobar, suave: true }
      : { clave: 'codigo', etiqueta: T.panelCola.campoCodigo, valor: p.codigo ?? a?.codigo ?? sinDato },
  );

  const tipo: TipoPunto = (d.tipo as TipoPunto | undefined) ?? a?.tipo ?? p.tipo_actual ?? tipoDePropuesta(p);
  poner({
    clave: 'tipo',
    etiqueta: T.panelCola.campoTipo,
    valor: valorDe('tipo', tipo),
    cambia: alta || propone('tipo'),
    antes: propone('tipo') ? antesDe('tipo', a?.tipo) : undefined,
  });

  if (alta) {
    poner({
      clave: 'diametro_mm',
      etiqueta: T.panelCola.campoDiametro,
      // Una boca de otra medida se lee como su número; un hidrante, como "otra medida" (docs/24 RV-101).
      valor:
        tipo === 'boca_riego'
          ? T.formato.mm(texto(d.diametro_otro ?? d.diametro_mm ?? 45))
          : d.diametro_otro != null
            ? T.panelCola.otraMedida(texto(d.diametro_otro))
            : valorDe('diametro_mm', d.diametro_mm),
      cambia: true,
    });
  } else if (propone('diametro_mm') || propone('diametro_otro')) {
    poner({
      clave: 'diametro_mm',
      etiqueta: T.panelCola.campoDiametro,
      valor: 'diametro_otro' in d ? T.formato.mm(texto(d.diametro_otro)) : valorDe('diametro_mm', d.diametro_mm),
      antes: antesDe('diametro_mm', a?.diametro_mm),
      cambia: true,
    });
  } else {
    poner({
      clave: 'diametro_mm',
      etiqueta: T.panelCola.campoDiametro,
      valor: a?.diametro_mm != null ? valorDe('diametro_mm', a.diametro_mm) : sinDato,
    });
  }

  const cambiaCaudal = alta || op === 'estado';
  const caudal = cambiaCaudal ? texto(d.caudal) : (a?.caudal ?? '');
  poner({
    clave: 'caudal',
    etiqueta: T.panelCola.campoEstado,
    valor: caudal ? valorDe('caudal', caudal) : sinDato,
    caudal: caudal || undefined,
    cambia: cambiaCaudal,
    antes: op === 'estado' ? antesDe('caudal', a?.caudal) : undefined,
  });

  if (tipo === 'boca_riego') {
    const cambiaRacor = (alta && !!d.racor) || propone('racor');
    poner({
      clave: 'racor',
      etiqueta: T.panelCola.campoRacor,
      valor: cambiaRacor ? valorDe('racor', d.racor) : a?.racor ? valorDe('racor', a.racor) : sinDato,
      antes: propone('racor') ? antesDe('racor', a?.racor) : undefined,
      cambia: cambiaRacor,
    });
  }

  const cambiaDescripcion = (alta && !!texto(d.descripcion)) || propone('descripcion');
  poner({
    clave: 'descripcion',
    etiqueta: T.panelCola.campoDescripcion,
    valor: (cambiaDescripcion ? texto(d.descripcion) : texto(a?.descripcion)) || sinDato,
    antes: propone('descripcion') ? antesDe('descripcion', a?.descripcion) : undefined,
    cambia: cambiaDescripcion,
  });

  // El fallo, solo si el punto queda en "no funciona" (o la propuesta lo describe).
  const cambiaFallo = (alta || op === 'estado') && !!texto(d.descripcion_fallo);
  if (cambiaFallo || caudal === 'no_funciona') {
    poner({
      clave: 'descripcion_fallo',
      etiqueta: T.panelCola.campoFallo,
      valor: (cambiaFallo ? texto(d.descripcion_fallo) : texto(a?.descripcion_fallo)) || sinDato,
      antes: cambiaFallo && op === 'estado' ? antesDe('descripcion_fallo', a?.descripcion_fallo) : undefined,
      cambia: cambiaFallo,
    });
  }

  const direccionHoy = a?.direccion ?? p.direccion_actual;
  const sugerida = texto(p.direccion_sugerida);
  const cambiaDireccion = op === 'ubicacion' && !!sugerida && sugerida !== texto(direccionHoy);
  poner({
    clave: 'direccion',
    etiqueta: T.ficha.direccion,
    valor: (alta || cambiaDireccion ? sugerida : texto(direccionHoy)) || sinDato,
    antes: cambiaDireccion ? texto(direccionHoy) || undefined : undefined,
    cambia: cambiaDireccion,
  });

  poner({
    clave: 'nucleo',
    etiqueta: T.panelCola.campoNucleo,
    valor: p.nucleo ?? a?.nucleo ?? (p.fuera_de_zona ? T.panelCola.fueraDeZona : T.panelCola.sinNucleo),
  });

  const pin = conUbicacion(p) ? { lat: p.lat!, lng: p.lng! } : null;
  const hoy = alta ? null : posicionActual(p, inventario);
  const moverse = op === 'ubicacion' && !!pin && !!hoy;
  const [wgs, utm] = coordenadasDe(pin ?? hoy);
  const [wgsAntes, utmAntes] = coordenadasDe(hoy);
  poner({
    clave: 'wgs84',
    etiqueta: T.coordenadas.decimal,
    valor: wgs,
    antes: moverse ? wgsAntes : undefined,
    cambia: moverse,
  });
  poner({
    clave: 'utm',
    etiqueta: T.coordenadas.utm,
    valor: utm,
    antes: moverse ? utmAntes : undefined,
    cambia: moverse,
  });

  if (alta) {
    poner({
      clave: 'revision',
      etiqueta: T.panelCola.campoUltimaRevision,
      valor: T.panelCola.seFijaAlAprobar,
      suave: true,
    });
  } else {
    const ultima = a?.fecha_ultima_revision ? fechaCorta(a.fecha_ultima_revision) : undefined;
    poner(
      op === 'revision'
        ? {
            clave: 'revision',
            etiqueta: T.panelCola.campoUltimaRevision,
            antes: pendiente ? ultima : undefined,
            valor: fechaCorta(p.creada_en),
            cambia: true,
          }
        : { clave: 'revision', etiqueta: T.panelCola.campoUltimaRevision, valor: ultima ?? sinDato },
    );
  }

  poner({
    clave: 'origen',
    etiqueta: T.panelCola.campoOrigen,
    valor: !pin
      ? T.panelCola.origenDelPunto
      : p.origen_ubicacion === 'gps'
        ? T.panelCola.origenGps(Math.round(p.precision_gps_m ?? 0))
        : p.origen_ubicacion === 'manual'
          ? T.panelCola.origenManual
          : sinDato,
  });
  poner({ clave: 'autor', etiqueta: T.panelCola.campoPropuestoPor, valor: autor(p) || sinDato });

  const cambian = resto.filter((c) => c.cambia);
  return {
    campos: [...cambian, ...extras, ...resto.filter((c) => !c.cambia)],
    cambios: cambian.length,
    alta,
  };
}

/** Qué dibuja el mapa del detalle (RV-110): en las seis operaciones, con la capa con la que se abre. */
export interface PlanMapa {
  /** Dónde se centra; null si no se sabe dónde está el punto (se dice con palabras). */
  centro: LatLng | null;
  /** El pin propuesto (alta y ubicación), en naranja. */
  propuesta: LatLng | null;
  /** Dónde está hoy el punto: con anillo, o en gris si la propuesta lo mueve. */
  actual: LatLng | null;
  /** Corregir ubicación: la flecha de la posición de ahora a la propuesta, con los metros. */
  flecha: { metros: number } | null;
  /** Alta: el círculo del radio de duplicado alrededor del pin. */
  circulo: boolean;
  capa: 'base' | 'satelite';
  puntoId: string | null;
  duplicadoId: string | null;
}

export function planMapa(p: PropuestaPanel, inventario?: Punto): PlanMapa {
  const propuesta = conUbicacion(p) ? { lat: p.lat!, lng: p.lng! } : null;
  const actual = p.operacion === 'alta' ? null : posicionActual(p, inventario);
  const ubicacion = p.operacion === 'ubicacion';
  return {
    centro: propuesta ?? actual,
    propuesta,
    actual,
    flecha: ubicacion && propuesta && actual ? { metros: metros(actual, propuesta) } : null,
    circulo: p.operacion === 'alta' && !!propuesta,
    // Una ubicación se juzga mejor sobre la foto aérea; lo demás, sobre el mapa.
    capa: ubicacion ? 'satelite' : 'base',
    puntoId: p.punto_id,
    duplicadoId: p.duplicado_de,
  };
}

export interface FotoDetalle {
  path: string;
  etiqueta: string;
  /** Nueva frente a la actual del punto: etiqueta en naranja. */
  nueva: boolean;
}

/**
 * Las fotos del detalle (RV-110). Alta: conexión y sitio. Con fotos nuevas sobre un punto que ya
 * existe: la actual del punto delante de las nuevas, para ver si es el mismo. Sin fotos nuevas: las
 * actuales del punto, y `nuevas: false` para decirlo en el título.
 */
export function fotosDe(p: PropuestaPanel, inventario?: Punto): { fotos: FotoDetalle[]; nuevas: boolean } {
  const a = puntoActual(p, inventario);
  const conexionHoy = a?.foto_path ?? p.foto_path_actual ?? null;
  const sitioHoy = a?.foto_sitio_path ?? p.foto_sitio_path_actual ?? null;
  const sitioNuevo = p.foto_sitio_path ?? null;
  if (p.foto_path) {
    if (p.operacion === 'alta') {
      return {
        nuevas: true,
        fotos: [
          { path: p.foto_path, etiqueta: T.formulario.conexion, nueva: false },
          ...(sitioNuevo ? [{ path: sitioNuevo, etiqueta: T.formulario.sitio, nueva: false }] : []),
        ],
      };
    }
    return {
      nuevas: true,
      fotos: [
        ...(conexionHoy ? [{ path: conexionHoy, etiqueta: T.panelCola.fotoActualPunto, nueva: false }] : []),
        { path: p.foto_path, etiqueta: T.panelCola.fotoNueva(T.panelCola.conexion), nueva: true },
        ...(sitioNuevo ? [{ path: sitioNuevo, etiqueta: T.panelCola.fotoNueva(T.panelCola.sitio), nueva: true }] : []),
      ],
    };
  }
  const fotos: FotoDetalle[] = [];
  if (conexionHoy)
    fotos.push({ path: conexionHoy, etiqueta: T.panelCola.fotoActual(T.panelCola.conexion), nueva: false });
  if (sitioHoy) fotos.push({ path: sitioHoy, etiqueta: T.panelCola.fotoActual(T.panelCola.sitio), nueva: false });
  return { fotos, nuevas: false };
}

// ---------- aprobar con correcciones (FR-106) ----------

export interface ValoresPunto {
  tipo: TipoPunto;
  diametro_mm: number | null;
  caudal: Caudal;
  racor: Racor | null;
  descripcion_fallo: string;
  descripcion: string;
}

/**
 * Cómo quedaría el punto si se aprueba tal cual: el estado actual con lo que la propuesta cambia. El
 * estado actual es la fila `punto` que trae la cola (0036) y, si falta, el inventario (docs/32 RV-251).
 */
export function valoresPropuestos(p: PropuestaPanel, inventario?: Punto): ValoresPunto {
  const punto = puntoActual(p, inventario);
  const d = p.datos ?? {};
  const tipo = (d.tipo as TipoPunto | undefined) ?? punto?.tipo ?? 'hidrante';
  const diametro =
    tipo === 'boca_riego'
      ? (numeroDe(d.diametro_otro ?? d.diametro_mm) ?? punto?.diametro_mm ?? 45)
      : d.diametro_otro != null
        ? null
        : ((d.diametro_mm as number | undefined) ?? punto?.diametro_mm ?? null);
  return {
    tipo,
    diametro_mm: diametro,
    caudal: (d.caudal as Caudal | undefined) ?? punto?.caudal ?? 'bueno',
    racor: tipo === 'boca_riego' ? ((d.racor as Racor | undefined) ?? punto?.racor ?? null) : null,
    descripcion_fallo: texto(d.descripcion_fallo ?? punto?.descripcion_fallo),
    descripcion: texto(d.descripcion ?? punto?.descripcion),
  };
}

/**
 * Lo que jefatura ha cambiado respecto a lo propuesto: eso es `correcciones` (05 §7). El tipo solo se
 * corrige en un alta: fuera de ella no cambia (DEC-090) y el formulario no lo ofrece.
 */
export function correccionesDe(propuesto: ValoresPunto, final: ValoresPunto): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  if (final.tipo !== propuesto.tipo) c.tipo = final.tipo;
  // Jefatura fija el de un hidrante (70 o 100) y corrige el de una boca con cualquier entero de 20 a 150.
  // Si cambia el tipo, va siempre: si no, el servidor tomaría el diametro_otro de lo propuesto.
  if (final.diametro_mm !== propuesto.diametro_mm || final.tipo !== propuesto.tipo) c.diametro_mm = final.diametro_mm;
  if (final.caudal !== propuesto.caudal) c.caudal = final.caudal;
  if (final.tipo === 'boca_riego' && final.racor !== propuesto.racor) c.racor = final.racor;
  if (final.caudal === 'no_funciona' && final.descripcion_fallo.trim() !== propuesto.descripcion_fallo.trim()) {
    c.descripcion_fallo = final.descripcion_fallo.trim();
  }
  if (final.descripcion.trim() !== propuesto.descripcion.trim()) c.descripcion = final.descripcion.trim();
  return c;
}

/**
 * El formulario de correcciones al día cuando cambia lo propuesto con él abierto (una sincronización,
 * un `PROPUESTA_DESACTUALIZADA`; docs/32 RV-251): lo que jefatura ha tocado respecto a lo que vio se
 * queda; lo demás pasa a lo nuevo. Así "Guardar y aprobar" no manda como correcciones valores viejos.
 */
export function ponerAlDia(visto: ValoresPunto, escrito: ValoresPunto, nuevo: ValoresPunto): ValoresPunto {
  // Cambiar el tipo (solo en un alta) arrastra diámetro y enganche: lo escrito va entero.
  if (escrito.tipo !== visto.tipo) return escrito;
  const r = { ...nuevo };
  for (const k of Object.keys(escrito) as (keyof ValoresPunto)[]) {
    if (escrito[k] !== visto[k]) (r as Record<keyof ValoresPunto, unknown>)[k] = escrito[k];
  }
  return r;
}

const numeroDe = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** Diámetro de una boca: entero de 20 a 150 mm (restricción puntos_diametro_boca, DEC-144). */
export const diametroBocaValido = (d: number | null) => d != null && Number.isInteger(d) && d >= 20 && d <= 150;

/**
 * Qué impide aprobar tal cual por el diámetro: un hidrante de "otra medida" hasta que jefatura fije 70
 * o 100 (FR-17, DIAMETRO_SIN_FIJAR). Una boca de otra medida se aprueba tal cual (FR-16, DEC-144).
 */
export function bloqueoPorMedida(p: PropuestaPanel, punto?: Punto): string | null {
  if (!p.otra_medida) return null;
  return tipoDePropuesta(p, punto) === 'boca_riego' ? null : T.panelCola.fijaDiametro;
}

/**
 * El tipo del punto de una propuesta: el del alta, el del punto si se tiene a mano o, si no (la lista
 * de la cola), el del código: "corregir datos" no trae el tipo en `datos` (DEC-090).
 */
export function tipoDePropuesta(p: PropuestaPanel, punto?: Punto): TipoPunto {
  const tipo = p.datos?.tipo as TipoPunto | undefined;
  if (tipo === 'hidrante' || tipo === 'boca_riego') return tipo;
  if (punto) return punto.tipo;
  return p.codigo?.startsWith('BOC-') ? 'boca_riego' : 'hidrante';
}

/** Qué impide guardar el formulario de correcciones, o null si se puede (UI-02). */
export function faltaEnCorrecciones(v: ValoresPunto): string | null {
  if (v.tipo === 'hidrante' && v.diametro_mm !== 70 && v.diametro_mm !== 100) return T.panelCola.fijaDiametro;
  if (v.tipo === 'boca_riego' && !diametroBocaValido(v.diametro_mm)) return T.avisosFormulario.indicaMedida;
  if (v.tipo === 'boca_riego' && !v.racor) return T.avisosFormulario.eligeRacor;
  if (v.caudal === 'no_funciona' && !v.descripcion_fallo.trim()) return T.avisosFormulario.describeFallo;
  return null;
}

/**
 * La dirección va en las correcciones solo si jefatura la ha cambiado respecto a la que se le enseñó al
 * abrir (la sugerida o deducida, o la del punto), no respecto al `direccion_sugerida` del momento, que
 * sigue a null hasta recargar aunque la deducida ya esté guardada. Vaciarla manda null: el servidor la
 * quita (FR-105, docs/31 RV-162).
 */
export function conDireccion(
  c: Record<string, unknown>,
  escrita: string,
  ensenada: string | null,
): Record<string, unknown> {
  const d = escrita.trim();
  if (d === (ensenada ?? '').trim()) return c;
  return { ...c, direccion: d || null };
}

// ---------- fusionar con el existente (FR-51, FR-106) ----------

export type Prevalece = 'propuesta' | 'existente';
export type CampoFusion = 'racor' | 'caudal' | 'diametro_mm' | 'descripcion' | 'ubicacion';

export interface DiferenciaFusion {
  campo: CampoFusion;
  propuesta: string;
  existente: string;
}

/** Campos que difieren entre el alta y el punto existente: para cada uno, jefatura elige. */
export function diferenciasFusion(p: PropuestaPanel, existente: Punto): DiferenciaFusion[] {
  const d = p.datos ?? {};
  const difs: DiferenciaFusion[] = [];
  // Una boca de otra medida trae `diametro_otro`, y es el que se copia al fusionar (0032, DEC-144); el
  // servidor lo pasa a entero. Un hidrante de otra medida no tiene diámetro que copiar.
  const diametro =
    existente.tipo === 'boca_riego' ? numeroDe(d.diametro_mm ?? d.diametro_otro) : numeroDe(d.diametro_mm);
  if (diametro != null && Math.round(diametro) !== existente.diametro_mm) {
    difs.push({
      campo: 'diametro_mm',
      propuesta: valorDe('diametro_mm', Math.round(diametro)),
      existente: valorDe('diametro_mm', existente.diametro_mm),
    });
  }
  if (d.caudal && d.caudal !== existente.caudal) {
    difs.push({
      campo: 'caudal',
      propuesta: valorDe('caudal', d.caudal),
      existente: valorDe('caudal', existente.caudal),
    });
  }
  if (d.racor && d.racor !== existente.racor) {
    difs.push({ campo: 'racor', propuesta: valorDe('racor', d.racor), existente: valorDe('racor', existente.racor) });
  }
  // FR-106: "cada campo que difiere", y la descripción difiere a menudo (RV-18).
  const descripcion = typeof d.descripcion === 'string' ? d.descripcion.trim() : '';
  if (descripcion && descripcion !== (existente.descripcion ?? '').trim()) {
    difs.push({
      campo: 'descripcion',
      propuesta: valorDe('descripcion', descripcion),
      existente: valorDe('descripcion', existente.descripcion),
    });
  }
  if (p.lat != null && p.lng != null) {
    difs.push({
      campo: 'ubicacion',
      propuesta: T.panelCola.pinPropuesto(distancia(metros(existente, { lat: p.lat, lng: p.lng }))),
      existente: T.panelCola.ubicacionDe(existente.codigo),
    });
  }
  return difs;
}

/** Lo más largo que cabe en una opción de un `<select>` a 412 px; el texto entero va en `title` (RV-254). */
export const MAXIMO_OPCION = 60;

/** Un texto recortado a `maximo` caracteres, "…" incluido. */
export function recortarOpcion(texto: string, maximo = MAXIMO_OPCION): string {
  return texto.length > maximo ? `${texto.slice(0, maximo - 1).trimEnd()}…` : texto;
}

// ---------- historial (FR-109) ----------

const vacio = (v: unknown) => v == null || (typeof v === 'string' && !v.trim());

/**
 * Las correcciones de una propuesta ya decidida, en palabras (docs/32 RV-255): "Dirección → —",
 * "Tipo de enganche → Barcelona", "Diámetro → 70 mm". Lo que no es un campo del punto (ids internos,
 * `fusionada_con`) no sale. Sin nada que enseñar, null.
 */
export function cambiosDecision(c: Record<string, unknown> | null | undefined): string | null {
  const partes = Object.entries(c ?? {})
    .filter(([k]) => Object.hasOwn(ETIQUETA_CAMPO, k))
    .map(([k, v]) => `${etiquetaCampo(k)} → ${vacio(v) ? '—' : valorDe(k, v)}`);
  return partes.length ? partes.join(', ') : null;
}

// ---------- acciones (05 §6.2) ----------

/**
 * Tras moderar, el voluntario recibe su aviso al momento: se pide el envío a /api/push, una vez por
 * acción (también en los lotes), en vez de esperar a la pasada del Worker de avisos (RV-08, FR-163, DEC-097).
 */
function avisar<T>(r: Resultado<T>): Resultado<T> {
  if (r.ok) void pedirEnvioComoJefatura();
  return r;
}

/** Tras cambiar puntos, el inventario y el mapa se refrescan y se avisa. */
function refrescar<T>(r: Resultado<T>): Resultado<T> {
  if (r.ok) void sincronizar(null);
  return avisar(r);
}

export async function aprobar(
  id: string,
  correcciones: Record<string, unknown> | null,
  confirmarDesactualizada: boolean,
): Promise<Resultado<{ punto_id: string; codigo: string }>> {
  return refrescar(
    await rpc('fn_aprobar', {
      propuesta_id: id,
      correcciones: correcciones && Object.keys(correcciones).length ? correcciones : null,
      confirmar_desactualizada: confirmarDesactualizada,
    }),
  );
}

export interface ResultadoLote {
  propuesta_id: string;
  resultado: 'aprobada' | 'omitida';
  motivo: string | null;
}

export async function aprobarLote(ids: string[]): Promise<Resultado<ResultadoLote[]>> {
  const r = refrescar(await rpc<ResultadoLote[]>('fn_aprobar_lote', { propuesta_ids: ids }));
  if (r.ok && !Array.isArray(r.datos)) return { ok: false, codigo: 'ERROR_INTERNO' };
  return r;
}

const rechazarUna = (id: string, motivo: string) =>
  rpc<null>('fn_rechazar', { propuesta_id: id, motivo: motivo.trim() });

export const rechazar = async (id: string, motivo: string) => avisar(await rechazarUna(id, motivo));

/** Rechazo de varias con un motivo común: una a una; devuelve cuántas se rechazaron. */
export async function rechazarLote(ids: string[], motivo: string): Promise<{ hechas: number; fallos: string[] }> {
  const fallos: string[] = [];
  let hechas = 0;
  for (const id of ids) {
    const r = await rechazarUna(id, motivo);
    if (r.ok) hechas++;
    else fallos.push(r.codigo);
  }
  // Un solo envío de avisos para todo el lote.
  if (hechas) void pedirEnvioComoJefatura();
  return { hechas, fallos };
}

/**
 * Fusionar con el existente. `direccion`: la que jefatura ha escrito en el detalle, solo si la ha
 * cambiado (la misma regla que al aprobar, `conDireccion`); null la quita. Va en `prevalece.direccion`
 * y gana sobre la sugerida (0041, docs/32 RV-253). Sin ella, el servidor hace lo de antes.
 */
export async function fusionar(
  id: string,
  puntoId: string,
  prevalece: Partial<Record<CampoFusion, Prevalece>>,
  direccion?: string | null,
): Promise<Resultado<{ punto_id: string; codigo: string }>> {
  const conDir = direccion === undefined ? prevalece : { ...prevalece, direccion };
  return refrescar(await rpc('fn_fusionar_con_existente', { propuesta_id: id, punto_id: puntoId, prevalece: conDir }));
}

export interface DireccionDeducida {
  direccion: string;
  /**
   * Si el servidor la guardó como sugerida de la propuesta. Solo entonces es la que se aplica al aprobar
   * sin tocarla; si no, el panel la manda como corrección (docs/31 RV-162). Una Function anterior que no
   * lo dice la guardaba siempre, salvo un fallo que no contaba: se da por guardada.
   */
  guardada: boolean;
}

/** Dirección deducida con Nominatim (FR-105). Nunca bloquea: sin respuesta, null. */
export async function deducirDireccion(p: PropuestaPanel): Promise<DireccionDeducida | null> {
  if (p.lat == null || p.lng == null) return null;
  const q = new URLSearchParams({ lat: String(p.lat), lng: String(p.lng), propuesta_id: p.id });
  const r = await funcion<{ direccion: string | null; guardada?: boolean }>(`/api/direccion?${q}`);
  if (!r.ok || !r.datos.direccion) return null;
  return { direccion: r.datos.direccion, guardada: r.datos.guardada !== false };
}

// ---------- resultados en palabras (TR-36, UI-04) ----------

/** Por qué quedó fuera una propuesta del lote (FR-107). */
export function motivoOmitida(codigo: string | null): string {
  if (codigo?.startsWith('PROPUESTA_DESACTUALIZADA')) return T.panelCola.omitidaDesactualizada;
  if (codigo?.startsWith('PUNTO_NO_ACTIVO')) return T.panelCola.omitidaPuntoNoActivo;
  if (codigo?.startsWith('DIAMETRO_SIN_FIJAR')) return T.panelCola.omitidaDiametro;
  if (codigo?.startsWith('PROPUESTA_NO_PENDIENTE')) return T.panelCola.omitidaYaResuelta;
  if (codigo?.startsWith('PUNTO_OCUPADO')) return T.panelErrores.puntoOcupado;
  if (codigo?.startsWith('TIPO_NO_MODIFICABLE')) return T.panelCola.omitidaTipo;
  return T.panelCola.omitidaDatos;
}

/** Resumen del lote: "N aprobadas" y, si alguna quedó fuera, cuál y por qué. */
export function resumenLote(res: ResultadoLote[], nombre: (id: string) => string): string {
  const aprobadas = res.filter((r) => r.resultado === 'aprobada').length;
  const fuera = res.filter((r) => r.resultado === 'omitida');
  const base = T.panelCola.loteAprobadas(aprobadas);
  if (!fuera.length) return base;
  return `${base} ${T.panelCola.loteOmitidas(fuera.map((r) => `${nombre(r.propuesta_id)}: ${motivoOmitida(r.motivo)}`).join('; '))}`;
}
