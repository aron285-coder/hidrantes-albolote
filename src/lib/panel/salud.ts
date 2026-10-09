// Salud del sistema en palabras (FR-143, docs/33 RV-335, U13): arriba un resumen ("Todo bien" o lo
// que necesita atención) y debajo las filas que quedan, cada una con su nombre en palabras. Fuera
// (indicación del desarrollador): propuestas de más de 14 días, puntos sin dirección y, de las tareas
// programadas, el resumen semanal y la purga de errores: siguen funcionando, solo no salen aquí.
//
// Las filas salen de `filasSalud`, en orden. Un dato que la base todavía no devuelve (una versión
// anterior de fn_salud) no rompe nada: la fila dice "sin dato" o no se dibuja. La fila "Entradas
// frenadas por el tope (24 h)" de RV-338 se añade aquí, detrás de "Códigos de acceso fallidos".

import type { Entorno } from '../entorno';
import { fechaCorta, hace } from '../formato';
import { abiertaHasta, diaYHora } from './entrada';
import { T } from '../textos';
import {
  AVISAR_ESPACIO_PCT,
  CUOTA_BD_BYTES,
  type Salud,
  type TareaProgramada,
  avisoEspacioFotos,
  textoAlmacenamiento,
  vigilanciaAtrasada,
} from './ajustes';

export interface FilaSalud {
  etiqueta: string;
  valor: string;
  /** Pide atención: el valor va en tono de aviso (RV-93). */
  aviso: boolean;
  /** % ocupado (0–100) para la barra de espacio; solo en Fotos y Base de datos con su tope. */
  barra?: number;
  /** Un enlace junto al valor: "abrir la entrada 24 h" (RV-338). */
  accion?: 'abrirEntrada';
}

/** Con más frenados que estos y la entrada cerrada, avisa (como la vigilancia, docs/33 RV-300). */
export const FRENADAS_AVISO = 5;

/** Con un respaldo a la semana, más de 8 días es que no ha habido el último (como la vigilancia, RV-201). */
export const RESPALDO_VIEJO_DIAS = 8;

/** Tareas que siguen en pg_cron pero ya no salen en Salud (docs/33 RV-335). */
const TAREAS_OCULTAS = new Set(['hidrantes_resumen_semanal', 'hidrantes_purgar_errores']);

const MB = 1024 ** 2;
const mb = (bytes: number) => Math.round(bytes / MB).toLocaleString('es-ES');
const recortar = (pct: number) => Math.max(0, Math.min(100, pct));

/** El nombre en palabras de una tarea de pg_cron; una que no conocemos, con el suyo sin el prefijo. */
export function nombreTarea(tarea: string): string {
  const nombres: Record<string, string> = T.panelAjustes.nombresTareas;
  return nombres[tarea] ?? tarea.replace(/^hidrantes_/, '');
}

/** Las tareas que se enseñan: todas menos las dos que el desarrollador quitó de Salud. */
export function tareasVisibles(s: Salud): TareaProgramada[] {
  return (s.tareas ?? []).filter((t) => !TAREAS_OCULTAS.has(t.tarea));
}

/** Fotos: MB de su tope (800) con barra; sin los datos de 0041, el dato de antes y sin barra. */
function filaFotos(s: Salud, entorno: Entorno): FilaSalud {
  const lleno = avisoEspacioFotos(s) != null;
  if (s.fotos_bytes == null || s.fotos_origen === 'sin_dato' || !s.max_bytes_fotos || s.fotos_pct == null) {
    return { etiqueta: T.panelAjustes.fotos, valor: textoAlmacenamiento(s.storage_bytes, entorno), aviso: lleno };
  }
  const texto = T.panelAjustes.espacioDe(mb(s.fotos_bytes), mb(s.max_bytes_fotos));
  // Sin lectura en vivo del bucket, el dato es el del último respaldo: se dice (05 §2.6), sin tono de
  // aviso: el tono es solo para lo que el resumen de arriba pide mirar.
  return {
    etiqueta: T.panelAjustes.fotos,
    valor: s.fotos_origen === 'respaldo' ? T.panelAjustes.espacioSegunRespaldo(texto) : texto,
    aviso: lleno,
    // El % que mira el servidor: el bucket más las reservas abiertas.
    barra: recortar(s.fotos_pct),
  };
}

/**
 * La base de datos con su tope. Con 0044, lo que ocupa nuestro esquema contra `max_bytes_bd` y el %
 * que da el servidor (`bd_pct`), que es lo que frena las propuestas (docs/33 RV-301). Sin esquema
 * medido, toda la base; sin el tope de 0041, contra los 500 MB del plan gratuito.
 */
function espacioBd(s: Salud): { bytes: number; tope: number; pct: number } | null {
  const bytes = s.max_bytes_bd ? (s.esquema_bytes ?? s.bd_bytes) : s.bd_bytes;
  if (bytes == null) return null;
  const tope = s.max_bytes_bd || CUOTA_BD_BYTES;
  return { bytes, tope, pct: s.max_bytes_bd && s.bd_pct != null ? s.bd_pct : (bytes / tope) * 100 };
}

function filaBd(s: Salud): FilaSalud {
  const e = espacioBd(s);
  if (!e) return { etiqueta: T.panelAjustes.baseDeDatos, valor: T.panelAjustes.sinDato, aviso: false };
  const { pct } = e;
  return {
    etiqueta: T.panelAjustes.baseDeDatos,
    valor: T.panelAjustes.espacioDe(mb(e.bytes), mb(e.tope)),
    aviso: pct >= AVISAR_ESPACIO_PCT,
    barra: recortar(pct),
  };
}

function respaldoViejo(ultimo: string, ahora: Date): boolean {
  const desde = new Date(ultimo).getTime();
  return !Number.isNaN(desde) && ahora.getTime() - desde > RESPALDO_VIEJO_DIAS * 86_400_000;
}

/** Una versión de la zona o del mapa base: si es una fecha, como fecha ("14 jul 2026"). */
const version = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? fechaCorta(`${v}T12:00:00Z`) : v);

function textoZonaYMapa(s: Salud): string {
  const zona = s.version_zona ? version(s.version_zona) : null;
  const mapa = s.version_mapabase ? version(s.version_mapabase) : null;
  if (!zona && !mapa) return T.panelAjustes.sinDato;
  if (zona === mapa) return zona!;
  return `${zona ?? T.panelAjustes.sinDato} · ${mapa ?? T.panelAjustes.sinDato}`;
}

/** Un número de fn_salud; si la base no lo trae, "sin dato" (nunca un 0 inventado). */
const numero = (n: number | null | undefined) => (n == null ? T.panelAjustes.sinDato : String(n));

/** Sin ninguna vigilancia anotada fuera de staging: nadie ha comprobado que todo responde. */
const sinVigilancia = (s: Salud, entorno: Entorno) => !s.ultima_vigilancia && entorno !== 'staging';

/** Las filas de Salud del sistema, en orden (docs/33 RV-335). */
export function filasSalud(s: Salud, entorno: Entorno, ahora: Date = new Date()): FilaSalud[] {
  const atrasada = vigilanciaAtrasada(s.ultima_vigilancia, ahora);
  return [
    filaFotos(s, entorno),
    filaBd(s),
    {
      etiqueta: T.panelAjustes.ultimoRespaldo,
      valor: s.ultimo_respaldo
        ? `${hace(s.ultimo_respaldo, ahora)} · ${fechaCorta(s.ultimo_respaldo)}`
        : entorno === 'staging'
          ? T.panelAjustes.respaldoNoAplica
          : T.panelAjustes.nunca,
      aviso: entorno !== 'staging' && (!s.ultimo_respaldo || respaldoViejo(s.ultimo_respaldo, ahora)),
    },
    {
      etiqueta: T.panelAjustes.ultimaVigilancia,
      valor: s.ultima_vigilancia
        ? [
            hace(s.ultima_vigilancia, ahora),
            ...(s.vigilancia_ok === true ? [T.panelAjustes.vigilanciaBien] : []),
            ...(s.vigilancia_ok === false ? [T.panelAjustes.vigilanciaMal] : []),
            ...(atrasada ? [T.panelAjustes.vigilanciaAtrasada] : []),
          ].join(' · ')
        : T.panelAjustes.nunca,
      aviso: atrasada || (!!s.ultima_vigilancia && s.vigilancia_ok === false) || sinVigilancia(s, entorno),
    },
    { etiqueta: T.panelAjustes.errores7, valor: numero(s.errores_7d), aviso: false },
    { etiqueta: T.panelAjustes.dispositivosActivos, valor: numero(s.dispositivos_activos), aviso: false },
    { etiqueta: T.panelAjustes.intentosFallidos24h, valor: numero(s.intentos_fallidos_24h), aviso: false },
    ...filaFrenadas(s, ahora),
    { etiqueta: T.panelAjustes.zonaYMapaBase, valor: textoZonaYMapa(s), aviso: false },
  ];
}

/**
 * "Entradas frenadas por el tope (24 h)", con 0044 (docs/33 RV-338): con la entrada cerrada, el enlace
 * que la abre; abierta, hasta cuándo. Sin el dato (base sin 0044), no hay fila.
 */
function filaFrenadas(s: Salud, ahora: Date): FilaSalud[] {
  const n = s.entradas_frenadas_24h;
  if (n == null) return [];
  const hasta = abiertaHasta(s.entrada_abierta_hasta, ahora);
  if (hasta) {
    const { dia, hora } = diaYHora(hasta);
    return [
      {
        etiqueta: T.panelAjustes.entradasFrenadas24h,
        valor: `${n} · ${T.panelAjustes.entradaAbiertaCorto(dia, hora)}`,
        aviso: false,
      },
    ];
  }
  return [
    {
      etiqueta: T.panelAjustes.entradasFrenadas24h,
      valor: String(n),
      aviso: n > FRENADAS_AVISO,
      accion: 'abrirEntrada',
    },
  ];
}

/**
 * Lo que necesita atención, para el resumen de arriba; vacío es "Todo bien". En este orden: el
 * respaldo, la vigilancia, el espacio (fotos y base de datos desde el 70 %) y las tareas que fallan.
 */
export function atencionSalud(s: Salud, entorno: Entorno, ahora: Date = new Date()): string[] {
  const lista: string[] = [];
  // En staging no se respalda (docs/20 RV-78): que no haya respaldo no es un problema.
  if (entorno !== 'staging') {
    if (!s.ultimo_respaldo) lista.push(T.panelAjustes.atencionSinRespaldo);
    else if (respaldoViejo(s.ultimo_respaldo, ahora))
      lista.push(T.panelAjustes.atencionRespaldoViejo(hace(s.ultimo_respaldo, ahora)));
  }
  if (sinVigilancia(s, entorno)) lista.push(T.panelAjustes.atencionSinVigilancia);
  else if (vigilanciaAtrasada(s.ultima_vigilancia, ahora)) lista.push(T.panelAjustes.atencionVigilancia);
  else if (s.ultima_vigilancia && s.vigilancia_ok === false) lista.push(T.panelAjustes.atencionVigilanciaAvisos);
  const fotos = avisoEspacioFotos(s);
  if (fotos) {
    lista.push(
      fotos.delTope ? T.panelAjustes.espacioFotosLleno(fotos.pct) : T.panelAjustes.almacenamientoLleno(fotos.pct),
    );
  }
  const bd = espacioBd(s);
  if (bd && bd.pct >= AVISAR_ESPACIO_PCT)
    lista.push(T.panelAjustes.atencionBaseDeDatos(Math.min(Math.round(bd.pct), 100)));
  const frenadas = s.entradas_frenadas_24h;
  if (frenadas != null && frenadas > FRENADAS_AVISO && !abiertaHasta(s.entrada_abierta_hasta, ahora))
    lista.push(T.panelAjustes.atencionFrenadas(frenadas));
  for (const t of tareasVisibles(s)) {
    if (t.falta) lista.push(T.panelAjustes.atencionTareaFalta(nombreTarea(t.tarea)));
    else if (t.problema) lista.push(T.panelAjustes.atencionTarea(nombreTarea(t.tarea)));
  }
  return lista;
}
