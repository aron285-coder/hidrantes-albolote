// Sesión del voluntario en este móvil (FR-30–FR-35, TR-43). Lo que se guarda: el token de
// dispositivo, el nombre y apellido y el identificador del móvil. El código de acceso, nunca.

import { borrar, escribir, leer } from './almacen';

export interface SesionVoluntario {
  token: string;
  nombre: string;
  apellido: string;
}

export interface Firma {
  nombre: string;
  apellido: string;
}

const CLAVE_TOKEN = 'token';
const CLAVE_FIRMA = 'firma';
const CLAVE_DISPOSITIVO = 'dispositivo_id';
const CLAVE_PRIMER_USO = 'primer_uso_visto';
const CLAVE_BLOQUEO = 'bloqueado_hasta';

/** Identificador aleatorio del móvil: se crea una vez y se renueva al cerrar sesión (DEC-060). */
export function dispositivoId(): string {
  const existente = leer<string>(CLAVE_DISPOSITIVO);
  if (existente) return existente;
  const nuevo = crypto.randomUUID();
  escribir(CLAVE_DISPOSITIVO, nuevo);
  return nuevo;
}

export function leerSesion(): SesionVoluntario | null {
  const token = leer<string>(CLAVE_TOKEN);
  const firma = leerFirma();
  return token && firma ? { token, ...firma } : null;
}

export function leerFirma(): Firma | null {
  const f = leer<Firma>(CLAVE_FIRMA);
  return f && f.nombre && f.apellido ? f : null;
}

export function guardarSesion(token: string, firma: Firma): void {
  escribir(CLAVE_TOKEN, token);
  guardarFirma(firma);
  borrar(CLAVE_BLOQUEO);
}

export function guardarFirma(firma: Firma): void {
  escribir(CLAVE_FIRMA, { nombre: firma.nombre.trim(), apellido: firma.apellido.trim() });
}

/**
 * El servidor ya no acepta el token (revocado o caducado): se pide el código otra vez
 * conservando el nombre (FR-35).
 */
export function olvidarToken(): void {
  borrar(CLAVE_TOKEN);
}

/** Cerrar sesión: acceso, nombre y datos del móvil; el móvil pasa a ser uno nuevo (FL-12, DEC-060). */
export function cerrarSesion(): void {
  for (const c of [
    CLAVE_TOKEN,
    CLAVE_FIRMA,
    CLAVE_DISPOSITIVO,
    CLAVE_PRIMER_USO,
    'sincronizado_en',
    'puntos_guardados',
  ]) {
    borrar(c);
  }
}

export const primerUsoVisto = () => leer<boolean>(CLAVE_PRIMER_USO) === true;
export const marcarPrimerUsoVisto = () => escribir(CLAVE_PRIMER_USO, true);

/** Bloqueo por demasiados intentos (FR-33): una hora, sin pistas. */
export function bloqueadoHasta(ahora = Date.now()): number | null {
  const hasta = leer<number>(CLAVE_BLOQUEO);
  return hasta && hasta > ahora ? hasta : null;
}

export function bloquear(ahora = Date.now()): void {
  escribir(CLAVE_BLOQUEO, ahora + 3600_000);
}

/** Códigos de error que significan "este móvil tiene que volver a entrar". */
export const esErrorDeAcceso = (codigo: string) => codigo.startsWith('TOKEN_');
