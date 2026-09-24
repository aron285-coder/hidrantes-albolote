// Cliente de Supabase: sesión de Google de jefatura (FR-36) y llamadas a las RPC del esquema
// hidrantes. Si el build no tiene configuración (p. ej. en los e2e sin servidor), no hay cliente
// y la app se comporta como con el servidor caído (FR-168).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { LIMITES_RED, fetchConLimite } from './red';

// Sin tipos generados del esquema: las RPC devuelven lo que dice 05 y se tipan en src/lib/api.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, 'hidrantes', 'hidrantes'>;

let cliente: Cliente | null | undefined;

export function supabase(): Cliente | null {
  if (cliente !== undefined) return cliente;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const clave = import.meta.env.VITE_SUPABASE_ANON_KEY;
  cliente =
    url && clave
      ? createClient(url, clave, {
          db: { schema: 'hidrantes' },
          // Toda petición con límite de tiempo (RV-01): un aborto llega como error sin status y
          // se trata como servidor no disponible.
          global: { fetch: fetchConLimite(() => LIMITES_RED.rpc) },
          auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true, storageKey: 'hidrantes.auth' },
        })
      : null;
  return cliente;
}
