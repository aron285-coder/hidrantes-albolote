// La caché de las Functions en staging (docs/19 RV-63): dos peticiones iguales con el secreto de
// vigilancia, y la segunda tiene que salir de la caché. Solo avisa: nunca tira el despliegue.
// Solo módulos de Node: corre con `node` en el trabajo que tiene el secreto, sin node_modules
// (docs/35 RV-410, DEC-198).
//
//   node scripts/comprobar-caches.ts --url https://hidrantes-albolote-staging.pages.dev
//                                    (deploy-staging.yml, con VIGILANCIA_SECRETO)

import { abortar, argumentos, ejecutarScript, log } from './lib/comun.ts';

/** Qué dice la segunda de dos peticiones iguales (docs/19 RV-63). */
export function estadoCache(segunda: string | null): 'funciona' | 'no_funciona' | 'sin_dato' {
  if (segunda === 'hit') return 'funciona';
  return segunda === 'miss' ? 'no_funciona' : 'sin_dato';
}

/**
 * Dos peticiones iguales a /api/geocodificar y a /api/direccion con el secreto de vigilancia: la
 * segunda tiene que salir de la caché (`x-hidrantes-cache: hit`). En *.pages.dev la Cache API puede
 * no guardar nada; entonces se avisa, sin tirar el despliegue, porque la protección real es el tope
 * por token de las Functions (DEC-092, RV-63).
 */
export async function comprobarCaches(url: string, secreto: string): Promise<void> {
  const pedir = (ruta: string, init: RequestInit = {}) =>
    fetch(new URL(ruta, url), { ...init, headers: { 'X-Vigilancia': secreto, ...(init.headers ?? {}) } })
      .then((r) => r.headers.get('x-hidrantes-cache'))
      .catch(() => null);
  const casos: [string, () => Promise<string | null>][] = [
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
    const estado = estadoCache(await peticion());
    if (estado === 'funciona') log.ok(`${ruta}: la segunda petición igual sale de la caché`);
    else {
      const texto = `${ruta}: la segunda petición igual ${estado === 'no_funciona' ? 'no sale de la caché' : 'no dice si sale de la caché'}. La protección real es el tope de 30 por minuto y token (DEC-092, docs/19 RV-63).`;
      if (process.env.CI) console.log(`::warning::${texto}`);
      log.aviso(texto);
    }
  }
}

async function principal(): Promise<void> {
  const { valores } = argumentos();
  const url = valores.get('url') ?? abortar('Falta --url');
  const secreto = process.env.VIGILANCIA_SECRETO;
  if (!secreto) {
    // No es un fallo silencioso: se dice en el registro y en el resumen. El despliegue sigue.
    const texto = 'Falta VIGILANCIA_SECRETO: la caché de las Functions no se ha comprobado (docs/19 RV-63).';
    if (process.env.CI) console.log(`::warning::${texto}`);
    log.aviso(texto);
    return;
  }
  await comprobarCaches(url, secreto);
}

if (import.meta.main) ejecutarScript(principal);
