// Llamadas al servidor: las Pages Functions (/api) y las RPC (05 §6, §9). Devuelven siempre un
// resultado, nunca lanzan: los errores llegan como códigos de 05 §8 y la pantalla los traduce
// (TR-36). Cada llamada anota si el servidor respondió, para la degradación controlada (FR-168).

import { anotarServidor } from './conexion';
import { LIMITES_RED, fetchConLimite } from './red';
import { supabase } from './supabase';

/**
 * `mensaje`: el texto del error de la RPC, tal cual. Solo para distinguir dos errores con el mismo
 * código (FOTO_NO_RESERVADA de una foto o de la otra, docs/24 RV-103); nunca se enseña.
 */
export type Resultado<T> = { ok: true; datos: T } | { ok: false; codigo: string; mensaje?: string };

export const SIN_SERVIDOR = 'SERVIDOR_NO_DISPONIBLE';

/**
 * Código solo de cliente (05 §8): la respuesta no traía un código de los nuestros (un PGRST… durante
 * un despliegue, un 409, un 429). No sale de ninguna RPC; la cola lo reintenta (RV-03).
 */
export const DESCONOCIDO = 'DESCONOCIDO';

/**
 * Código de 05 §8 a partir del error de una RPC ("CODIGO: texto"). Un 401/403 o un 42501 es
 * NO_AUTORIZADO, como en functions/_lib/comun.ts; lo que no tiene forma de código, DESCONOCIDO.
 */
export function codigoDeError(mensaje: string | undefined, status?: number, code?: string): string {
  const m = /^([A-Z_]+(?:\([a-z_]+\))?):/.exec(mensaje ?? '');
  if (m) return m[1];
  if (status === 401 || status === 403 || code === '42501') return 'NO_AUTORIZADO';
  return DESCONOCIDO;
}

export async function rpc<T>(nombre: string, argumentos: Record<string, unknown> = {}): Promise<Resultado<T>> {
  const cliente = supabase();
  if (!cliente) {
    anotarServidor(false);
    return { ok: false, codigo: SIN_SERVIDOR };
  }
  try {
    const { data, error, status } = await cliente.rpc(nombre, argumentos);
    if (error) {
      // status 0 o >= 500: no llegó al servidor o este falló; lo demás es una respuesta válida
      const caido = !status || status >= 500;
      anotarServidor(!caido);
      if (caido) return { ok: false, codigo: SIN_SERVIDOR };
      return { ok: false, codigo: codigoDeError(error.message, status, error.code), mensaje: error.message };
    }
    anotarServidor(true);
    return { ok: true, datos: data as T };
  } catch {
    anotarServidor(false);
    return { ok: false, codigo: SIN_SERVIDOR };
  }
}

export interface Canje {
  token: string;
  caduca_en: string;
}

/** Canje del código por un token (FR-31). El código solo viaja aquí y no se guarda. */
export async function verificarCodigo(codigo: string, dispositivoId: string): Promise<Resultado<Canje>> {
  try {
    // Con un límite, como el resto: con señal débil, «Entrar» no se queda girando para siempre.
    const r = await fetchConLimite(() => LIMITES_RED.canje)('/api/verificar-codigo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, dispositivo_id: dispositivoId }),
    });
    const cuerpo = (await r.json().catch(() => ({}))) as Partial<Canje> & { error?: string };
    if (r.ok && cuerpo.token) {
      anotarServidor(true);
      return { ok: true, datos: cuerpo as Canje };
    }
    const caido = r.status >= 500 || !cuerpo.error;
    anotarServidor(!caido);
    return { ok: false, codigo: caido ? SIN_SERVIDOR : cuerpo.error! };
  } catch {
    anotarServidor(false);
    return { ok: false, codigo: SIN_SERVIDOR };
  }
}
