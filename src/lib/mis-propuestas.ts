// Mis propuestas (FR-90, FR-91, FR-48): lo enviado desde este móvil y en qué quedó. Se guarda la
// última lista en el móvil para verla sin cobertura; lo que aún no ha salido está en la cola.

import { SIN_SERVIDOR, type Resultado, rpc } from './api';
import { escribir, leer } from './almacen';
import type { Operacion } from './propuestas';
import { leerSesion } from './sesion';
import { T } from './textos';

export type EstadoPropuesta = 'pendiente' | 'aprobada' | 'rechazada' | 'retirada_por_autor';

/** Una fila de fn_mis_propuestas: nunca trae quién decidió (FR-27). */
export interface PropuestaPropia {
  id: string;
  clave_local: string;
  operacion: Operacion;
  punto_id: string | null;
  codigo: string | null;
  datos: Record<string, unknown>;
  estado: EstadoPropuesta;
  motivo_rechazo: string | null;
  correcciones: Record<string, unknown> | null;
  creada_en: string;
  revisada_en: string | null;
}

const CLAVE = 'mis_propuestas';
const VISTAS = 'propuestas_vistas';

let lista: PropuestaPropia[] = leer<PropuestaPropia[]>(CLAVE) ?? [];
let novedades: PropuestaPropia[] = [];
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((o) => o());

export const misPropuestas = () => lista;
export const novedadesPendientes = () => novedades;
export function suscribirMisPropuestas(o: () => void): () => void {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

/** Resueltas desde la última vez que se miró (FR-90). La primera carga no avisa de lo antiguo. */
export function calcularNovedades(
  propuestas: PropuestaPropia[],
  vistas: Record<string, EstadoPropuesta> | null,
): PropuestaPropia[] {
  if (!vistas) return [];
  return propuestas.filter((p) => (p.estado === 'aprobada' || p.estado === 'rechazada') && vistas[p.id] !== p.estado);
}

/**
 * Código solo de cliente: la sesión se cerró mientras llegaba la respuesta (RV-153). La lista era
 * del anterior y se tira; no es un error que enseñar.
 */
export const SESION_CAMBIADA = 'SESION_CAMBIADA';

/** Sube al cerrar sesión: una carga empezada antes ya no escribe (como en cola y puntos). */
let generacion = 0;

export async function cargarMisPropuestas(): Promise<Resultado<PropuestaPropia[]>> {
  const sesion = leerSesion();
  if (!sesion) return { ok: true, datos: [] };
  const gen = generacion;
  const r = await rpc<PropuestaPropia[]>('fn_mis_propuestas', { token: sesion.token });
  if (gen !== generacion) return { ok: false, codigo: SESION_CAMBIADA };
  if (!r.ok) return r;
  // Nunca fiarse de la forma de una respuesta: una lista rara no debe tumbar la pantalla (TR-106).
  lista = Array.isArray(r.datos) ? r.datos : [];
  escribir(CLAVE, lista);
  const vistas = leer<Record<string, EstadoPropuesta>>(VISTAS);
  novedades = calcularNovedades(lista, vistas);
  if (!vistas) marcarVistas();
  avisar();
  return { ok: true, datos: lista };
}

/** El voluntario ha visto el aviso: no se repite. */
export function marcarVistas(): void {
  escribir(VISTAS, Object.fromEntries(lista.map((p) => [p.id, p.estado])));
  novedades = [];
  avisar();
}

/**
 * Al abrir Mis propuestas: cargar y, solo si la carga ha ido bien, dar lo resuelto por visto
 * (RV-153). Con la carga fallida, lo nuevo sigue avisando la próxima vez.
 */
export async function cargarYMarcarVistas(): Promise<Resultado<PropuestaPropia[]>> {
  const r = await cargarMisPropuestas();
  if (r.ok && leerSesion()) marcarVistas();
  return r;
}

/**
 * Cerrar sesión (RV-153): en un móvil compartido, quien entra después no ve las propuestas, los
 * motivos de rechazo ni los avisos del anterior. Lo guardado lo borra `cerrarSesion`.
 */
export function olvidarMisPropuestas(): void {
  generacion++;
  lista = [];
  novedades = [];
  avisar();
}

/** Retirar una propuesta propia pendiente (FR-48). */
export async function retirarPropuesta(id: string): Promise<Resultado<null>> {
  const sesion = leerSesion();
  if (!sesion) return { ok: false, codigo: 'TOKEN_INVALIDO' };
  const r = await rpc('fn_retirar_propuesta', { token: sesion.token, propuesta_id: id });
  if (!r.ok) return r;
  await cargarMisPropuestas();
  return { ok: true, datos: null };
}

/** Por qué no se pudo retirar, en palabras del voluntario (UI-05, RV-23). */
export function textoErrorRetirar(codigo: string): string {
  if (codigo.startsWith('PROPUESTA_NO_PENDIENTE')) return T.misPropuestas.yaRevisada;
  if (codigo === SIN_SERVIDOR) return T.entrada.sinServidor;
  return T.misPropuestas.errorRetirar;
}

/** Solo para los tests. */
export function _reiniciarMisPropuestas() {
  generacion++;
  lista = [];
  novedades = [];
  oyentes.clear();
}
