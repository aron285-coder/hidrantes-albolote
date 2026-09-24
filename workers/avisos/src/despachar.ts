// Despacha los avisos push pendientes cada 5 minutos (docs/19 RV-52, DEC-097). El cron de GitHub es
// de mejor esfuerzo y `avisos.yml` corría cada 3 a 5 horas; un Cron Trigger de Cloudflare corre a su
// hora. El Worker no envía nada por sí mismo: pide a /api/push de cada destino que envíe lo suyo,
// con la cabecera X-Vigilancia (RV-08), y repite mientras la respuesta diga que quedan.
//
// Plan gratuito: 50 subpeticiones por invocación; aquí, como mucho 10 por destino, 20 en total. El
// tiempo de espera de fetch no cuenta como CPU; parsear respuestas tan pequeñas, muy por debajo de
// los 10 ms. Nunca registra datos: solo el destino y el código de respuesta.

export interface Env {
  /** Orígenes separados por comas, sin barra final. */
  DESTINOS: string;
  VIGILANCIA_SECRETO_PROD?: string;
  VIGILANCIA_SECRETO_STAGING?: string;
}

export type Salida = 'ok' | 'sin_secreto' | 'no_autorizado' | 'no_encontrado' | 'fallo';

export interface Resumen {
  destino: string;
  llamadas: number;
  enviadas: number;
  salida: Salida;
}

export const MAX_VUELTAS = 10;
export const TIEMPO_MAXIMO_MS = 25_000;
const PRODUCCION = 'hidrantes-albolote.pages.dev';

/** El secreto de cada destino: producción el suyo; cualquier otro (staging, local), el de staging. */
export function secretoDe(destino: string, env: Env): string | undefined {
  const host = new URL(destino).host;
  return host === PRODUCCION ? env.VIGILANCIA_SECRETO_PROD : env.VIGILANCIA_SECRETO_STAGING;
}

async function unDestino(destino: string, secreto: string, fetchFn: typeof fetch): Promise<Resumen> {
  const resumen: Resumen = { destino, llamadas: 0, enviadas: 0, salida: 'ok' };
  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    resumen.llamadas++;
    let r: Response;
    try {
      r = await fetchFn(`${destino}/api/push`, {
        method: 'POST',
        headers: { 'X-Vigilancia': secreto, 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
      });
    } catch {
      // Red caída o más de 25 s: se anota y se sigue con el siguiente destino.
      resumen.salida = 'fallo';
      return resumen;
    }
    // 401: el secreto de Pages aún no está desplegado; 404: el destino aún no tiene /api/push.
    // Un destino atrasado no para al otro.
    if (r.status === 401) return { ...resumen, salida: 'no_autorizado' };
    if (r.status === 404) return { ...resumen, salida: 'no_encontrado' };
    if (!r.ok) return { ...resumen, salida: 'fallo' };
    const cuerpo = (await r.json().catch(() => null)) as { enviadas?: number; quedan?: boolean } | null;
    resumen.enviadas += cuerpo?.enviadas ?? 0;
    if (!cuerpo?.quedan) break;
  }
  return resumen;
}

const hostDe = (destino: string) => {
  try {
    return new URL(destino).host;
  } catch {
    return 'destino no válido';
  }
};

/** Todos los destinos, uno tras otro. Nunca lanza: un fallo se anota y se sigue. */
export async function despachar(env: Env, fetchFn: typeof fetch = fetch): Promise<Resumen[]> {
  const resumenes: Resumen[] = [];
  let destinos: string[];
  try {
    destinos = env.DESTINOS.split(',')
      .map((d) => d.trim().replace(/\/+$/, ''))
      .filter(Boolean);
  } catch {
    console.warn('avisos: DESTINOS no está bien configurado');
    return resumenes;
  }
  for (const destino of destinos) {
    let resumen: Resumen;
    try {
      const secreto = secretoDe(destino, env);
      resumen = secreto
        ? await unDestino(destino, secreto, fetchFn)
        : { destino, llamadas: 0, enviadas: 0, salida: 'sin_secreto' };
    } catch {
      resumen = { destino, llamadas: 0, enviadas: 0, salida: 'fallo' };
    }
    // Sin datos: el destino, cuántas llamadas y cómo acabó.
    if (resumen.salida !== 'ok') console.warn(`avisos: ${hostDe(destino)} · ${resumen.salida}`);
    resumenes.push(resumen);
  }
  return resumenes;
}
