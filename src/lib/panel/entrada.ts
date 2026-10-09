// La entrada del día del lanzamiento (docs/33 RV-300, RV-338, DEC-190): jefatura abre la entrada
// con el código para todos durante 24 h, desde Ajustes → Código de acceso o desde Salud del sistema.
// Mientras está abierta, los topes de entradas desde una misma wifi y por hora no frenan a quien
// sabe el código; quien prueba códigos sigue frenado. Se cierra sola, o con «Cerrar ahora».
//
// Un servidor sin 0044 no tiene `config.entrada_abierta_hasta`: entonces `disponible` es false y el
// panel no enseña nada de esto (nunca un botón que llamaría a una función que no existe, UI-01).

import { type Resultado, rpc } from '../api';
import { leerLista } from './consultas';

export interface EstadoEntrada {
  /** La base tiene la entrada del lanzamiento (0044). */
  disponible: boolean;
  /** Hasta cuándo está abierta, o null si está cerrada (también si la hora ya pasó). */
  hasta: string | null;
}

/** Abierta = una hora válida en el futuro (05: `entrada_abierta_hasta`, timestamptz o null). */
export function abiertaHasta(valor: unknown, ahora: Date = new Date()): string | null {
  if (typeof valor !== 'string') return null;
  const t = new Date(valor).getTime();
  return Number.isFinite(t) && t > ahora.getTime() ? valor : null;
}

export async function cargarEntrada(ahora: () => Date = () => new Date()): Promise<Resultado<EstadoEntrada>> {
  const r = await leerLista<{ clave: string; valor: unknown }>((c) =>
    c.from('config').select('clave, valor').eq('clave', 'entrada_abierta_hasta'),
  );
  if (!r.ok) return r;
  const fila = r.datos.find((x) => x.clave === 'entrada_abierta_hasta');
  return { ok: true, datos: { disponible: !!fila, hasta: fila ? abiertaHasta(fila.valor, ahora()) : null } };
}

/** Abre la entrada `horas` horas desde ahora; devuelve hasta cuándo (fn_abrir_entrada, 0044). */
export const abrirEntrada = (horas = 24) => rpc<string>('fn_abrir_entrada', { horas });

export const cerrarEntrada = () => rpc<null>('fn_cerrar_entrada');

const DIA = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', timeZone: 'Europe/Madrid' });
const HORA = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

/** "jue 10" y "18:30", en hora de Albolote (TR-81). */
export function diaYHora(cuando: string): { dia: string; hora: string } {
  const f = new Date(cuando);
  const partes = DIA.formatToParts(f);
  const semana = partes.find((p) => p.type === 'weekday')?.value.replace('.', '') ?? '';
  const dia = partes.find((p) => p.type === 'day')?.value ?? '';
  return { dia: `${semana} ${dia}`.trim(), hora: HORA.format(f) };
}
