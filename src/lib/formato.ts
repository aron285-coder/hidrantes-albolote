// Formato de fechas y distancias para la interfaz (06 §8, UI-12). Textos en src/lib/textos.ts.

import { T } from './textos';

/** "hace un momento", "hace 5 min", "hace 3 h", "hace 2 días" (UI-12). */
export function hace(desde: Date | string | number, ahora: Date = new Date()): string {
  const ms = ahora.getTime() - new Date(desde).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return T.formato.haceUnMomento;
  if (min < 60) return T.formato.haceMin(min);
  const h = Math.floor(min / 60);
  if (h < 24) return T.formato.haceHoras(h);
  const d = Math.floor(h / 24);
  return d === 1 ? T.formato.haceUnDia : T.formato.haceDias(d);
}

/** Metros hasta 999; después km con un decimal y coma decimal (UI-12). */
export function distancia(metros: number): string {
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${(metros / 1000).toFixed(1).replace('.', ',')} km`;
}
