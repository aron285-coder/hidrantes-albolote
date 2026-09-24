// Puntos aprobados en el móvil y su sincronización incremental (FR-80, 05 §10). La app pinta siempre
// lo guardado; la red solo lo refresca. Voluntario: fn_listar_puntos con su token. Jefatura: lectura
// de v_puntos_activos con su sesión de Google (RLS de administrador).

import { type Resultado, rpc } from './api';
import { type Almacen, almacenPuntos } from './bd';
import { supabase } from './supabase';
import { anotarServidor } from './conexion';
import { type ConfigMovil, METROS_TRAMO_POR_DEFECTO, derivar, diaLocal, leerConfig, leerMetrosTramo } from './derivar';
import { metros } from './geometria';

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

/**
 * Config con la que se derivan radio_px y revision_caducada (RV-05); la última recibida. Null si no
 * hay ninguna guardada: es el caso de jefatura, que lee la vista y nunca recibe config. Entonces no
 * se re-deriva nada y los puntos se quedan con los valores del servidor (docs/18 RV-44).
 */
let config: ConfigMovil | null = null;
/** Jefatura no recibe config: el tramo de manguera lo lee aparte de la tabla (FR-142, GM-01). */
let tramoJefatura: number | null = null;

/**
 * Jefatura: el tramo, de la tabla de config (lo lee por RLS de administrador). Se pide cuando hace
 * falta, no al sincronizar: una lectura más en cada sincronización no aporta nada al mapa. Si no se
 * puede, se queda el que hubiera.
 */
export async function cargarTramoJefatura(): Promise<void> {
  const cliente = supabase();
  if (!cliente) return;
  try {
    const { data } = await cliente.from('config').select('valor').eq('clave', 'metros_tramo_manguera').maybeSingle();
    if (data) tramoJefatura = leerMetrosTramo((data as { valor: unknown }).valor);
  } catch {
    // sin config legible: el de por defecto
  }
}

/** Longitud del tramo de manguera con la que calcular los tramos (FR-74, FR-76). */
export const metrosTramoManguera = () => config?.metros_tramo_manguera ?? tramoJefatura ?? METROS_TRAMO_POR_DEFECTO;
/**
 * Generación de los datos: la sube borrarPuntos (cerrar sesión). Una sincronización que empezó antes
 * descarta su resultado sin escribir ni publicar (FL-12, docs/18 RV-45).
 */
let generacion = 0;
/**
 * Época de los datos del servidor: cambia al restaurar un respaldo (restaurar.ts). Distinta de la
 * guardada ⇒ sincronización completa, porque lo restaurado vuelve con sellos antiguos (RV-06).
 */
let epoca: string | null = null;
/** Última sincronización completa. Más de una semana ⇒ otra completa, por cualquier otra deriva. */
let completoEn: number | null = null;
export const MAX_SIN_COMPLETA_MS = 7 * 24 * 3600_000;

const epocaDe = (config: unknown): string | null => {
  const e = (config as { epoca_datos?: unknown } | null | undefined)?.epoca_datos;
  return typeof e === 'string' && e ? e : null;
};

/** Día local de la última derivación: si cambia, "sin revisar" puede haber cambiado sin red. */
let derivadoEl: string | null = null;

const derivarTodos = (puntos: Punto[]) => {
  if (!config) return puntos;
  const cfg = config;
  const hoy = new Date();
  derivadoEl = diaLocal(hoy);
  return puntos.map((p) => derivar(p, cfg, hoy));
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
    const [puntos, sello, guardado, cfg, epocaGuardada, completo] = await Promise.all([
      bd().todos(),
      bd().leerMeta<string>('sincronizado_en'),
      bd().leerMeta<number>('guardado_en'),
      bd().leerMeta<unknown>('config'),
      bd().leerMeta<string>('epoca_datos'),
      bd().leerMeta<number>('completo_en'),
    ]);
    epoca = epocaGuardada;
    completoEn = completo;
    config = leerConfig(cfg);
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
    const gen = generacion;
    fijar({ sincronizando: true });
    try {
      // Completa: la primera vez, siempre para jefatura y, como red de seguridad, si la última
      // completa tiene más de una semana (DEC-083). Sin fecha de completa (móviles de antes), el
      // reloj empieza a contar con esta.
      let completo =
        !estado.sincronizadoEn || !token || (completoEn !== null && Date.now() - completoEn > MAX_SIN_COMPLETA_MS);
      let listado: Listado;
      if (token) {
        const r = await rpc<Listado>('fn_listar_puntos', { token, desde: completo ? null : estado.sincronizadoEn });
        if (!r.ok) return r;
        listado = r.datos;
        // Datos restaurados: la incremental no los recogería. Se repite completa en esta misma
        // llamada. La primera época que se ve (null → valor) no fuerza nada.
        const recibida = epocaDe(listado?.config);
        if (!completo && recibida && epoca && recibida !== epoca) {
          const r2 = await rpc<Listado>('fn_listar_puntos', { token, desde: null });
          if (!r2.ok) return r2;
          listado = r2.datos;
          completo = true;
        }
      } else {
        const r = await leerComoJefatura();
        if (!r.ok) return r;
        listado = r.datos;
      }
      // Se cerró sesión mientras llegaba: lo recibido ya no es de nadie (RV-45).
      if (gen !== generacion) return { ok: true, datos: null };
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
      const nuevaEpoca = token ? (epocaDe(listado.config) ?? epoca) : epoca;
      if (completo || completoEn === null) completoEn = guardadoEn;
      epoca = nuevaEpoca;
      try {
        // Se guardan todos, no solo los recibidos: los derivados también cambian.
        await bd().reemplazar(token ? puntos : listado.puntos, listado.bajas, completo);
        if (nuevaConfig) await bd().escribirMeta('config', nuevaConfig);
        await bd().escribirMeta('sincronizado_en', listado.sincronizado_en);
        await bd().escribirMeta('guardado_en', guardadoEn);
        await bd().escribirMeta('completo_en', completoEn);
        if (nuevaEpoca) await bd().escribirMeta('epoca_datos', nuevaEpoca);
      } catch {
        // sin IndexedDB seguimos en memoria (TR-07)
      }
      if (gen !== generacion) {
        // Se cerró sesión mientras se escribía: se deshace lo escrito.
        config = null;
        epoca = null;
        completoEn = null;
        await bd()
          .borrarTodo()
          .catch(() => undefined);
        return { ok: true, datos: null };
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
  if (!config || !estado.puntos.length || derivadoEl === diaLocal()) return;
  fijar({ puntos: derivarTodos(estado.puntos) });
}

/** El max_rows de PostgREST (supabase/config.toml y el valor por defecto de Supabase). */
const PAGINA_JEFATURA = 1000;

async function leerComoJefatura(): Promise<Resultado<Listado>> {
  const cliente = supabase();
  if (!cliente) return { ok: false, codigo: 'SERVIDOR_NO_DISPONIBLE' };
  const ahora = new Date().toISOString();
  // PostgREST corta en max_rows (1.000, también en Supabase alojado) y esto es una sustitución
  // completa: sin páginas, el almacén se quedaba en silencio con los primeros 1.000 (RV-15, TR-60).
  // Páginas por clave (`codigo`, único): cada una empieza después del último código leído. Por
  // desplazamiento, un punto retirado entre dos páginas hacía saltarse otro que seguía activo (RV-65).
  // Un error a mitad no reemplaza nada.
  const todos: Punto[] = [];
  for (let ultimo: string | null = null; ;) {
    const orden = cliente.from('v_puntos_activos').select('*').order('codigo');
    const { data, error, status } = await (ultimo === null ? orden : orden.gt('codigo', ultimo)).limit(PAGINA_JEFATURA);
    if (error || !Array.isArray(data)) {
      anotarServidor(!!status && status < 500);
      return { ok: false, codigo: 'SERVIDOR_NO_DISPONIBLE' };
    }
    todos.push(...(data as Punto[]));
    if (data.length < PAGINA_JEFATURA) break;
    ultimo = (data[data.length - 1] as Punto).codigo;
  }
  anotarServidor(true);
  return { ok: true, datos: { puntos: todos, bajas: [], sincronizado_en: ahora } };
}

/** Cerrar sesión: el móvil deja de tener los puntos (FL-12). */
export async function borrarPuntos(): Promise<void> {
  generacion++;
  try {
    await bd().borrarTodo();
  } catch {
    // nada guardado
  }
  config = null;
  tramoJefatura = null;
  epoca = null;
  completoEn = null;
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
// Se movió a geometria.ts (docs/18 GM-01); se reexporta para no romper los imports.
export { metros };

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
  config = null;
  derivadoEl = null;
  epoca = null;
  completoEn = null;
  oyentes.clear();
}
