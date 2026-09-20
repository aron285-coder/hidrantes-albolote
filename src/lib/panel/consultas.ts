// Lecturas del panel (05 §5): jefatura lee tablas y vistas con su sesión de Google; RLS solo le
// deja ver algo si es administradora. Escribir, nunca: todo cambio va por una RPC (CLAUDE.md §3).
// Como rpc(), devuelve siempre un Resultado y anota si el servidor respondió (FR-168).

import { type Resultado, SIN_SERVIDOR } from '../api';
import { anotarServidor } from '../conexion';
import { supabase } from '../supabase';

type Cliente = NonNullable<ReturnType<typeof supabase>>;
interface Respuesta {
  data: unknown;
  error: { message: string } | null;
  status: number;
  count?: number | null;
}

/** Ejecuta una consulta del cliente y la convierte en Resultado. El tipo T lo pone quien llama (05). */
export async function leer<T>(consulta: (c: Cliente) => PromiseLike<Respuesta>): Promise<Resultado<T>> {
  const cliente = supabase();
  if (!cliente) {
    anotarServidor(false);
    return { ok: false, codigo: SIN_SERVIDOR };
  }
  try {
    const { data, error, status } = await consulta(cliente);
    if (error) {
      const caido = !status || status >= 500;
      anotarServidor(!caido);
      return { ok: false, codigo: caido ? SIN_SERVIDOR : 'ERROR_INTERNO' };
    }
    anotarServidor(true);
    return { ok: true, datos: data as T };
  } catch {
    anotarServidor(false);
    return { ok: false, codigo: SIN_SERVIDOR };
  }
}

/** Lectura de una lista: si llega algo que no es una lista, es un fallo (no una lista vacía). */
export async function leerLista<T>(consulta: (c: Cliente) => PromiseLike<Respuesta>): Promise<Resultado<T[]>> {
  const r = await leer<T[]>(consulta);
  if (r.ok && !Array.isArray(r.datos)) return { ok: false, codigo: 'ERROR_INTERNO' };
  return r;
}

/** Cuántas filas cumplen una condición, sin traerlas. */
export async function contar(consulta: (c: Cliente) => PromiseLike<Respuesta>): Promise<Resultado<number>> {
  const cliente = supabase();
  if (!cliente) return { ok: false, codigo: SIN_SERVIDOR };
  try {
    const { error, status, count } = await consulta(cliente);
    if (error || count == null) {
      anotarServidor(!!status && status < 500);
      return { ok: false, codigo: SIN_SERVIDOR };
    }
    anotarServidor(true);
    return { ok: true, datos: count };
  } catch {
    anotarServidor(false);
    return { ok: false, codigo: SIN_SERVIDOR };
  }
}

/** JWT de la sesión de Google, para las Pages Functions de jefatura (05 §9). */
export async function jwt(): Promise<string | null> {
  const { data } = (await supabase()?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.access_token ?? null;
}

/** Llamada a una Pages Function con el JWT de jefatura. */
export async function funcion<T>(
  ruta: string,
  { metodo = 'GET', cuerpo }: { metodo?: 'GET' | 'POST'; cuerpo?: unknown } = {},
): Promise<Resultado<T>> {
  const token = await jwt();
  if (!token) return { ok: false, codigo: 'NO_AUTORIZADO' };
  try {
    const r = await fetch(ruta, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const datos = (await r.json().catch(() => ({}))) as T & { error?: string };
    if (r.ok) {
      anotarServidor(true);
      return { ok: true, datos };
    }
    // Un error con código es una respuesta de la Function (p. ej. NO_CONFIGURADO): el servidor está.
    const caido = r.status >= 500 && !datos.error;
    anotarServidor(!caido);
    return { ok: false, codigo: datos.error ?? SIN_SERVIDOR };
  } catch {
    anotarServidor(false);
    return { ok: false, codigo: SIN_SERVIDOR };
  }
}

/** Una página de filas con el total que dice PostgREST en Content-Range (paginación del registro). */
export async function leerPagina<T>(
  consulta: (c: Cliente) => PromiseLike<Respuesta>,
): Promise<Resultado<{ filas: T[]; total: number }>> {
  const cliente = supabase();
  if (!cliente) {
    anotarServidor(false);
    return { ok: false, codigo: SIN_SERVIDOR };
  }
  try {
    const { data, error, status, count } = await consulta(cliente);
    if (error || !Array.isArray(data)) {
      const caido = !status || status >= 500;
      anotarServidor(!caido);
      return { ok: false, codigo: caido ? SIN_SERVIDOR : 'ERROR_INTERNO' };
    }
    anotarServidor(true);
    return { ok: true, datos: { filas: data as T[], total: count ?? data.length } };
  } catch {
    anotarServidor(false);
    return { ok: false, codigo: SIN_SERVIDOR };
  }
}
