// Llamadas al servidor: las Pages Functions (/api) y las RPC (05 §6, §9). Devuelven siempre un
// resultado, nunca lanzan: los errores llegan como códigos de 05 §8 y la pantalla los traduce
// (TR-36). Cada llamada anota si el servidor respondió, para la degradación controlada (FR-168).

import { anotarServidor } from './conexion';
import { supabase } from './supabase';

export type Resultado<T> = { ok: true; datos: T } | { ok: false; codigo: string };

export const SIN_SERVIDOR = 'SERVIDOR_NO_DISPONIBLE';

/** Código de 05 §8 a partir del mensaje de una RPC ("CODIGO: texto"). */
export function codigoDeError(mensaje: string | undefined): string {
  const m = /^([A-Z_]+(?:\([a-z_]+\))?):/.exec(mensaje ?? '');
  return m ? m[1] : 'ERROR_INTERNO';
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
      return { ok: false, codigo: caido ? SIN_SERVIDOR : codigoDeError(error.message) };
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
    const r = await fetch('/api/verificar-codigo', {
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
