// La caché de las Functions en staging (docs/19 RV-63): dos peticiones iguales con el secreto de
// vigilancia, y la segunda tiene que salir de la caché. Solo avisa: nunca tira el despliegue.
// Lo usa comprobar-despliegue.ts, que corre con `node` y sin node_modules en el trabajo que tiene el
// secreto (docs/35 RV-410, DEC-198).

import { appendFileSync } from 'node:fs';
import { log } from './lib/comun.ts';

/** Qué dice la segunda de dos peticiones iguales (docs/19 RV-63). */
export function estadoCache(segunda: string | null): 'funciona' | 'no_funciona' | 'sin_dato' {
  if (segunda === 'hit') return 'funciona';
  return segunda === 'miss' ? 'no_funciona' : 'sin_dato';
}

/** Lo que ha respondido una petición: la cabecera de la caché y el estado HTTP (0 sin respuesta). */
export interface Respuesta {
  cache: string | null;
  estado: number;
}

/** El aviso de una ruta cuya segunda petición no sale de la caché, o null si sale. */
export function avisoCache(ruta: string, segunda: Respuesta): string | null {
  const estado = estadoCache(segunda.cache);
  if (estado === 'funciona') return null;
  // Un estado que no es 200 no es un problema de caché: un secreto equivocado (401/403), la Function
  // caída (5xx) o la red. Se dice tal cual, para no esconderlo detrás de un aviso de caché.
  const http = segunda.estado === 0 ? 'sin respuesta' : `HTTP ${segunda.estado}`;
  if (segunda.estado !== 200) return `${ruta}: la petición con el secreto de vigilancia ha dado ${http}.`;
  return `${ruta}: la segunda petición igual ${estado === 'no_funciona' ? 'no sale de la caché' : 'no dice si sale de la caché'}. La protección real es el tope de 30 por minuto y token (DEC-092, docs/19 RV-63).`;
}

/**
 * Dos peticiones iguales a /api/geocodificar y a /api/direccion con el secreto de vigilancia: la
 * segunda tiene que salir de la caché (`x-hidrantes-cache: hit`). En *.pages.dev la Cache API puede
 * no guardar nada; entonces se avisa, sin tirar el despliegue, porque la protección real es el tope
 * por token de las Functions (DEC-092, RV-63).
 */
export async function comprobarCaches(url: string, secreto: string): Promise<void> {
  const pedir = (ruta: string, init: RequestInit = {}): Promise<Respuesta> =>
    fetch(new URL(ruta, url), { ...init, headers: { 'X-Vigilancia': secreto, ...(init.headers ?? {}) } })
      .then(async (r) => {
        await r.arrayBuffer().catch(() => undefined);
        return { cache: r.headers.get('x-hidrantes-cache'), estado: r.status };
      })
      .catch(() => ({ cache: null, estado: 0 }));
  const casos: [string, () => Promise<Respuesta>][] = [
    [
      '/api/geocodificar',
      () =>
        pedir('/api/geocodificar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: 'calle real 1' }),
        }),
    ],
    ['/api/direccion', () => pedir('/api/direccion?lat=37.2309&lng=-3.6558')],
  ];
  for (const [ruta, peticion] of casos) {
    await peticion();
    const texto = avisoCache(ruta, await peticion());
    if (!texto) {
      log.ok(`${ruta}: la segunda petición igual sale de la caché`);
      continue;
    }
    if (process.env.CI) console.log(`::warning::${texto}`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${texto}\n`);
    log.aviso(texto);
  }
}
