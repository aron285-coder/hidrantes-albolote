// Entorno de ejecución (04 §4). Se fija en el build con VITE_ENTORNO.

export type Entorno = 'local' | 'staging' | 'produccion';

export const ENTORNO: Entorno = import.meta.env.VITE_ENTORNO ?? 'local';
export const VERSION = __VERSION__;

/** La banda "ENTORNO DE PRUEBAS" se ve en todo lo que no es producción. */
export const esPruebas = ENTORNO !== 'produccion';
