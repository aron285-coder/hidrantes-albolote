// docs/39 RV-518: la guarda de proyecto (comprobarCadena) para los pasos de los workflows que usan la base con psql o
// pg_dump: el seed de staging, la purga de fotos y el respaldo. Con la cadena de otro proyecto (la de staging en el
// secreto de producción, por ejemplo) se para antes de tocar nada.
//
//   node scripts/comprobar-cadena.ts --entorno prod [--variable BD]
//
// Lee la cadena de la variable de entorno (SUPABASE_DB_URL si no se dice otra). Nunca la escribe.

import { abortar, argumentos, ejecutarScript, leerEntorno, log, motivoCadenaAjena } from './lib/comun.ts';

/** Por qué no sigue, o null si la cadena es del proyecto de ese entorno. */
export function motivoComprobacion(entorno: string, cadena: string | undefined): string | null {
  if (!cadena) return 'Falta la cadena de conexión.';
  return motivoCadenaAjena(leerEntorno(entorno, ['staging', 'prod']), cadena);
}

async function principal(): Promise<void> {
  const { valores } = argumentos();
  const variable = valores.get('variable') ?? 'SUPABASE_DB_URL';
  const entorno = valores.get('entorno');
  const motivo = motivoComprobacion(entorno ?? '', process.env[variable]);
  if (motivo) abortar(`${variable}: ${motivo}`);
  log.ok(`${variable} es del proyecto de ${entorno}`);
}

if (import.meta.main) ejecutarScript(principal);
