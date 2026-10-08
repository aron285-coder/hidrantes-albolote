// docs/32 RV-242: al entrar con el código, cada error tiene su texto. Antes, todo lo que no era
// "código incorrecto", "demasiados intentos" o "6 cifras" decía "Sin conexión", aunque el servidor sí
// hubiera contestado. Sin pistas sobre el código (FR-33, TR-36).

import { SIN_SERVIDOR } from './api';
import { T } from './textos';

/** "17:05", en la hora de España, como el resto de la app. */
const hora = (ms: number) =>
  new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(ms);

/**
 * Error de 05 §8 al canjear el código → texto para el voluntario. `bloqueadoHasta`: cuándo se puede
 * volver a intentar tras DEMASIADOS_INTENTOS (el bloqueo que guarda el móvil).
 */
export function mensajeEntrada(codigo: string, bloqueadoHasta: number | null = null): string {
  if (codigo === 'CODIGO_INCORRECTO') return T.entrada.codigoIncorrecto;
  if (codigo === 'DEMASIADOS_INTENTOS') {
    return bloqueadoHasta ? T.entrada.demasiadosIntentosHasta(hora(bloqueadoHasta)) : T.entrada.demasiadosIntentos;
  }
  if (codigo === 'PAYLOAD_INVALIDO') return T.entrada.codigoSeisCifras;
  if (codigo === SIN_SERVIDOR) return T.entrada.sinServidor;
  // El móvil ya ha pedido otro identificador una vez (docs/31 RV-159) y sigue reservado.
  if (codigo === 'DISPOSITIVO_RESERVADO') return T.entrada.dispositivoReservado;
  if (codigo.startsWith('CUOTA_')) return T.entrada.cuota;
  if (codigo.startsWith('TOKEN_')) return T.entrada.tokenNoVale;
  // Solo el código (mayúsculas y guiones bajos), nunca un texto del servidor tal cual.
  const limpio = codigo.replace(/[^A-Z0-9_]/g, '').slice(0, 40) || '?';
  return T.entrada.errorDesconocido(limpio);
}
