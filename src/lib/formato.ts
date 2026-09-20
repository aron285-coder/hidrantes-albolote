// Formato de fechas y distancias para la interfaz (06 §8, UI-12). Textos en src/lib/textos.ts.

import { T } from './textos';

/** "hace un momento", "hace 5 min", "hace 3 h", "hace 2 días", "hace 3 meses", "hace 2 años" (UI-12). */
export function hace(desde: Date | string | number, ahora: Date = new Date()): string {
  const ms = ahora.getTime() - new Date(desde).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return T.formato.haceUnMomento;
  if (min < 60) return T.formato.haceMin(min);
  const h = Math.floor(min / 60);
  if (h < 24) return T.formato.haceHoras(h);
  const d = Math.floor(h / 24);
  if (d < 30) return d === 1 ? T.formato.haceUnDia : T.formato.haceDias(d);
  const meses = Math.floor(d / 30.44);
  if (meses < 12) return meses <= 1 ? T.formato.haceUnMes : T.formato.haceMeses(meses);
  const anos = Math.floor(meses / 12);
  return anos === 1 ? T.formato.haceUnAno : T.formato.haceAnos(anos);
}

// Zona horaria fija (TR-81): se guarda en UTC y se enseña en hora de Albolote, venga el móvil o el
// ordenador de jefatura configurado como venga. Sin esto, algo enviado a las 00:30 se vería con la
// fecha del día anterior en un equipo puesto en UTC.
const FECHA = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Europe/Madrid',
});

/** Fecha absoluta corta: "20 ago 2026" (UI-12, junto a la relativa). */
export function fechaCorta(f: Date | string | number): string {
  return FECHA.format(new Date(f)).replace('.', '').replace(/ de /g, ' ');
}

/** Metros hasta 999, después km con un decimal y coma decimal (UI-12). */
export function distancia(metros: number): string {
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${(metros / 1000).toFixed(1).replace('.', ',')} km`;
}

/** Megas con una cifra decimal y coma: "4,2". */
export const megas = (bytes: number) => (bytes / 1024 / 1024).toFixed(1).replace('.', ',');
