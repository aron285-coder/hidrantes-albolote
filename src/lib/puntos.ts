// Puntos aprobados en el móvil y su sincronización incremental (FR-80, 05 §10). La app pinta siempre
// lo guardado; la red solo lo refresca. Voluntario: fn_listar_puntos con su token. Jefatura: lectura
// de v_puntos_activos con su sesión de Google (RLS de administrador).

import { type Resultado, rpc } from './api';
import { type Almacen, almacenPuntos } from './bd';
import { supabase } from './supabase';
import { anotarServidor } from './conexion';
import { CONFIG_POR_DEFECTO, type ConfigMovil, derivar, diaLocal, leerConfig } from './derivar';

import type { Caudal, Punto } from '../tipos/punto';

export type { Caudal, Punto, Racor, TipoPunto } from '../tipos/punto';

interface Listado {
  puntos: Punto[];
  bajas: string[];
  sincronizado_en: string;
  /** Solo en fn_listar_puntos (voluntario); la vista de jefatura no la trae. */
  config?: unknown;
}

export interface EstadoPuntos {
  puntos: Punto[];
  /** Sello del servidor de la última sincronización buena (no el reloj del móvil). */
  sincronizadoEn: string | null;
  /** Cuándo se guardó en este móvil, para "hace N min". */
  guardadoEn: number | null;
  cargado: boolean;
  sincronizando: boolean;
}

let almacen: Almacen<Punto> | null = null;
const bd = () => (almacen ??= almacenPuntos<Punto>());

/** Config con la que se derivan radio_px y revision_caducada (RV-05); la última recibida. */
let config: ConfigMovil = CONFIG_POR_DEFECTO;
/** Día local de la última derivación: si cambia, "sin revisar" puede haber cambiado sin red. */
let derivadoEl: string | null = null;

const derivarTodos = (puntos: Punto[]) => {
  const hoy = new Date();
  derivadoEl = diaLocal(hoy);
  return puntos.map((p) => derivar(p, config, hoy));
};

let estado: EstadoPuntos = { puntos: [], sincronizadoEn: null, guardadoEn: null, cargado: false, sincronizando: false };
const oyentes = new Set<() => void>();

function fijar(cambios: Partial<EstadoPuntos>) {
  estado = { ...estado, ...cambios };
  oyentes.forEach((o) => o());
}

export const estadoPuntos = () => estado;
export function suscribirPuntos(o: () => void): () => void {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

/** Lo guardado en el móvil, al arrancar: sin esperar a la red. */
export async function cargarGuardados(): Promise<void> {
  try {
    const [puntos, sello, guardado, cfg] = await Promise.all([
      bd().todos(),
      bd().leerMeta<string>('sincronizado_en'),
      bd().leerMeta<number>('guardado_en'),
      bd().leerMeta<unknown>('config'),
    ]);
    config = leerConfig(cfg) ?? CONFIG_POR_DEFECTO;
    fijar({ puntos: derivarTodos(puntos), sincronizadoEn: sello, guardadoEn: guardado, cargado: true });
  } catch {
    fijar({ cargado: true });
  }
}

/** Aplica una respuesta de fn_listar_puntos: reemplaza por id y quita las bajas (05 §10). */
export function aplicarListado(actuales: Punto[], l: Listado, completo: boolean): Punto[] {
  const porId = new Map(completo ? [] : actuales.map((p) => [p.id, p]));
  for (const id of l.bajas) porId.delete(id);
  for (const p of l.puntos) porId.set(p.id, p);
  return [...porId.values()];
}

let enCurso: Promise<Resultado<null>> | null = null;

/**
 * Sincroniza. Con `token`, como voluntario (incremental desde el último sello); sin token, como
 * jefatura (lectura completa de la vista). Devuelve el error de 05 §8 si lo hay: TOKEN_* lo trata acceso.
 */
export function sincronizar(token: string | null): Promise<Resultado<null>> {
  enCurso ??= (async () => {
    await Promise.resolve(); // mismo motivo que en cola.ts: el finally no debe adelantarse a ??=
    fijar({ sincronizando: true });
    try {
      const completo = !estado.sincronizadoEn || !token;
      let listado: Listado;
      if (token) {
        const r = await rpc<Listado>('fn_listar_puntos', { token, desde: completo ? null : estado.sincronizadoEn });
        if (!r.ok) return r;
        listado = r.datos;
      } else {
        const r = await leerComoJefatura();
        if (!r.ok) return r;
        listado = r.datos;
      }
      if (!listado || !Array.isArray(listado.puntos)) return { ok: false, codigo: 'ERROR_INTERNO' };
      listado.bajas = Array.isArray(listado.bajas) ? listado.bajas : [];
      // Voluntario: se deriva todo con la config recibida, también lo que no cambió (RV-05). Una
      // config que no sirve deja la anterior. Jefatura lee la vista entera: sus valores ya son
      // frescos y no trae config, así que no se re-deriva.
      const nuevaConfig = token ? leerConfig(listado.config) : null;
      if (nuevaConfig) config = nuevaConfig;
      const combinados = aplicarListado(estado.puntos, listado, completo);
      const puntos = token ? derivarTodos(combinados) : combinados;
      const guardadoEn = Date.now();
      try {
        // Se guardan todos, no solo los recibidos: los derivados también cambian.
        await bd().reemplazar(token ? puntos : listado.puntos, listado.bajas, completo);
        if (nuevaConfig) await bd().escribirMeta('config', nuevaConfig);
        await bd().escribirMeta('sincronizado_en', listado.sincronizado_en);
        await bd().escribirMeta('guardado_en', guardadoEn);
      } catch {
        // sin IndexedDB seguimos en memoria (TR-07)
      }
      fijar({ puntos, sincronizadoEn: listado.sincronizado_en, guardadoEn });
      return { ok: true, datos: null };
    } finally {
      fijar({ sincronizando: false });
      enCurso = null;
    }
  })();
  return enCurso;
}

/**
 * Al volver a la app (visibilitychange): si cambió el día local desde la última derivación, se
 * re-deriva sin red, porque un punto puede haber pasado a "sin revisar".
 */
export function rederivarSiCambiaElDia(): void {
  if (!estado.puntos.length || derivadoEl === diaLocal()) return;
  fijar({ puntos: derivarTodos(estado.puntos) });
}

async function leerComoJefatura(): Promise<Resultado<Listado>> {
  const cliente = supabase();
  if (!cliente) return { ok: false, codigo: 'SERVIDOR_NO_DISPONIBLE' };
  const ahora = new Date().toISOString();
  const { data, error, status } = await cliente.from('v_puntos_activos').select('*').order('codigo');
  if (error) {
    anotarServidor(!!status && status < 500);
    return { ok: false, codigo: 'SERVIDOR_NO_DISPONIBLE' };
  }
  anotarServidor(true);
  return { ok: true, datos: { puntos: data as Punto[], bajas: [], sincronizado_en: ahora } };
}

/** Cerrar sesión: el móvil deja de tener los puntos (FL-12). */
export async function borrarPuntos(): Promise<void> {
  try {
    await bd().borrarTodo();
  } catch {
    // nada guardado
  }
  config = CONFIG_POR_DEFECTO;
  fijar({ puntos: [], sincronizadoEn: null, guardadoEn: null });
}

// ---------- búsqueda, filtros y orden (FR-68, FR-69) ----------

export const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

/** Busca por código, dirección, descripción y núcleo; sin tildes ni mayúsculas. */
export function buscar(puntos: Punto[], texto: string): Punto[] {
  const q = normalizar(texto);
  if (!q) return puntos;
  const partes = q.split(/\s+/);
  return puntos.filter((p) => {
    const heno = normalizar([p.codigo, p.direccion, p.descripcion, p.nucleo].filter(Boolean).join(' '));
    return partes.every((parte) => heno.includes(parte));
  });
}

export type Filtro = 'todos' | 'hidrantes' | 'bocas' | 'no_funciona' | 'sin_revisar';

export function filtrar(puntos: Punto[], f: Filtro): Punto[] {
  switch (f) {
    case 'hidrantes':
      return puntos.filter((p) => p.tipo === 'hidrante');
    case 'bocas':
      return puntos.filter((p) => p.tipo === 'boca_riego');
    case 'no_funciona':
      return puntos.filter((p) => p.caudal === 'no_funciona');
    case 'sin_revisar':
      return puntos.filter((p) => p.revision_caducada);
    default:
      return puntos;
  }
}

export type Orden = 'distancia' | 'codigo' | 'estado';
const ORDEN_CAUDAL: Caudal[] = ['bueno', 'regular', 'malo', 'no_funciona'];

/** Metros entre dos puntos (haversine); suficiente a escala de municipio. */
export function metros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Sin posición, "distancia" ordena por código. */
export function ordenar(puntos: Punto[], orden: Orden, desde: { lat: number; lng: number } | null): Punto[] {
  const copia = [...puntos];
  const porCodigo = (a: Punto, b: Punto) => a.codigo.localeCompare(b.codigo);
  if (orden === 'distancia' && desde) return copia.sort((a, b) => metros(desde, a) - metros(desde, b));
  if (orden === 'estado') {
    return copia.sort((a, b) => ORDEN_CAUDAL.indexOf(a.caudal) - ORDEN_CAUDAL.indexOf(b.caudal) || porCodigo(a, b));
  }
  return copia.sort(porCodigo);
}

/** Solo para los tests. */
export function _usarAlmacen(a: Almacen<Punto>) {
  almacen = a;
  estado = { puntos: [], sincronizadoEn: null, guardadoEn: null, cargado: false, sincronizando: false };
  config = CONFIG_POR_DEFECTO;
  derivadoEl = null;
  oyentes.clear();
}
