// docs/39 RV-518: la guarda de proyecto (comprobarCadena) para los pasos de los workflows que usan la base con psql o
// pg_dump: el seed de staging, la purga de fotos y el respaldo. Con la cadena de otro proyecto (la de staging en el
// secreto de producción, por ejemplo) se para antes de tocar nada.
//
//   node scripts/comprobar-cadena.ts --entorno prod [--variable BD]
//   node scripts/comprobar-cadena.ts --entorno prod --url URL_API      (docs/40 RV-531: la URL de la API)
//
// Lee la cadena de la variable de entorno (SUPABASE_DB_URL si no se dice otra). Con --url y sin --variable, solo la
// URL de la API: tiene que ser https://<ref de ese entorno>.supabase.co. Nunca escribe ninguna de las dos.

import { REFS, abortar, argumentos, ejecutarScript, leerEntorno, log, motivoCadenaAjena } from './lib/comun.ts';

/** Por qué no sigue, o null si la cadena es del proyecto de ese entorno. */
export function motivoComprobacion(entorno: string, cadena: string | undefined): string | null {
  if (!cadena) return 'Falta la cadena de conexión.';
  return motivoCadenaAjena(leerEntorno(entorno, ['staging', 'prod']), cadena);
}

/** Por qué la URL de la API no es la del proyecto de ese entorno, o null. Sin la URL entera en el mensaje. */
export function motivoUrl(entorno: string, url: string | undefined): string | null {
  if (!url) return 'Falta la URL de la API.';
  const e = leerEntorno(entorno, ['staging', 'prod']) as keyof typeof REFS;
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(url)?.[1];
  if (ref === REFS[e]) return null;
  return `Esa URL es del proyecto ${ref ?? 'desconocido'}, y --entorno ${entorno} es ${REFS[e]}.`;
}

async function principal(): Promise<void> {
  const { valores } = argumentos();
  const entorno = valores.get('entorno');
  const url = valores.get('url');
  if (url) {
    const motivo = motivoUrl(entorno ?? '', process.env[url]);
    if (motivo) abortar(`${url}: ${motivo}`);
    log.ok(`${url} es del proyecto de ${entorno}`);
    if (!valores.has('variable')) return;
  }
  const variable = valores.get('variable') ?? 'SUPABASE_DB_URL';
  const motivo = motivoComprobacion(entorno ?? '', process.env[variable]);
  if (motivo) abortar(`${variable}: ${motivo}`);
  log.ok(`${variable} es del proyecto de ${entorno}`);
}

if (import.meta.main) ejecutarScript(principal);
