// Límites de tiempo de las peticiones de red (RV-01). Con señal débil una petición puede quedarse
// colgada minutos y, con ella, toda la cola de envíos. Un aborto por límite se trata como servidor
// no disponible: se reintenta con retroceso.

/** Límites en milisegundos. Mutables solo para que los tests no esperen minutos. */
export const LIMITES_RED = {
  /** POST /api/url-subida. */
  reserva: 20_000,
  /** PUT de la foto: 5 MB en 3G son unos 30 s; el resto es margen. */
  foto: 120_000,
  /** Cada RPC y cada petición de supabase-js. */
  rpc: 30_000,
};

function temporizada(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const c = new AbortController();
  setTimeout(() => c.abort(new DOMException('Tiempo agotado', 'TimeoutError')), ms);
  return c.signal;
}

/**
 * Señal que aborta a los `ms` o cuando aborte `senal`, la primera de las dos. `AbortSignal.any` no
 * existe en Safari 16 (llega en 17.4): ahí se combina a mano.
 */
export function conLimite(ms: number, senal?: AbortSignal | null): AbortSignal {
  const tiempo = temporizada(ms);
  if (!senal) return tiempo;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([senal, tiempo]);
  const c = new AbortController();
  for (const s of [senal, tiempo]) {
    if (s.aborted) {
      c.abort(s.reason);
      break;
    }
    s.addEventListener('abort', () => c.abort(s.reason), { once: true });
  }
  return c.signal;
}

/** `fetch` con límite de tiempo que respeta la señal que ya traiga la petición. */
export function fetchConLimite(ms: () => number): typeof fetch {
  return (entrada, init) => fetch(entrada, { ...init, signal: conLimite(ms(), init?.signal) });
}
