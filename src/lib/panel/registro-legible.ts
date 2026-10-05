// El detalle de una entrada del Registro en palabras de jefatura (docs/30 RV-127, DEC-171; FR-123).
// Se calcula en el cliente con `antes` y `despues`, que v_registro ya devuelve: la vista y la
// búsqueda del servidor (que sigue buscando en `resumen`, por nombre de campo) no cambian.

import { nombreCaudal, nombreRacor, nombreTipo } from '../ficha';
import { fechaCorta } from '../formato';
import { metros } from '../geometria';
import { ETIQUETA_OPERACION } from '../nombres-operacion';
import type { TipoPunto } from '../puntos';
import { T } from '../textos';
import type { EntradaRegistro } from './inventario';

type Objeto = Record<string, unknown>;
type Campo = keyof typeof T.panelRegistro.campos;

/** Los campos con nombre, en el orden en que se leen. La posición va aparte, al final ("Movido"). */
const ORDEN: readonly Campo[] = [
  'caudal',
  'racor',
  'diametro_mm',
  'tipo',
  'descripcion_fallo',
  'direccion',
  'descripcion',
  'nucleo',
  'fecha_ultima_revision',
  'foto_path',
  'foto_sitio_path',
  'situacion',
  'codigo',
  'motivo',
];

/**
 * Datos personales (11, FR-27): nunca se enseñan, a ninguna profundidad. El actor ya tiene su
 * columna. Cualquier `*_id` tampoco: entre ellas `dispositivo_id`.
 */
const PERSONALES = new Set(['autor_nombre', 'autor_apellido', 'actor']);

/**
 * Lo que no le dice nada a jefatura en el primer nivel de `antes`/`despues` (el punto entero de
 * fn_punto_json). Dentro de un objeto anidado (los filtros de una exportación) sí se enseñan:
 * allí `revision_caducada` es un filtro, no un dato calculado del punto.
 */
const TECNICAS = new Set([
  'id',
  'actualizado_en',
  'creado_en',
  'municipio',
  'desplazamiento_m',
  'revision_caducada',
  'borrado_en',
  'borrado_por',
  'lat',
  'lng',
]);

const personal = (k: string) => PERSONALES.has(k) || k.endsWith('_id');
const ignorada = (k: string, anidada: boolean) => personal(k) || (!anidada && TECNICAS.has(k));

const SEPARADOR = ' · ';
const VACIO = '—';
const MAXIMO = 60;
/** Por debajo, un movimiento calculado es ruido del GPS o del redondeo (docs/30 RV-127). */
const MOVIMIENTO_MINIMO_M = 0.5;

const esObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v);
const esPunto = (o: Objeto) => 'codigo' in o || 'tipo' in o;
const conNombre = (k: string): k is Campo => Object.hasOwn(T.panelRegistro.campos, k);
const nombreDe = (k: string) => (conNombre(k) ? T.panelRegistro.campos[k] : k);
const esFoto = (k: string) => k === 'foto_path' || k === 'foto_sitio_path';

function recortar(texto: string): string {
  return texto.length > MAXIMO ? `${texto.slice(0, MAXIMO - 1)}…` : texto;
}

const deTabla = <K extends string>(tabla: Record<K, string>, v: string) =>
  Object.hasOwn(tabla, v) ? tabla[v as K] : v;

/** Una fecha `date` (YYYY-MM-DD) a mediodía UTC: en Europe/Madrid nunca cambia de día. */
function fechaLegible(texto: string): string {
  const f = new Date(/^\d{4}-\d{2}-\d{2}$/.test(texto) ? `${texto}T12:00:00Z` : texto);
  return Number.isNaN(f.getTime()) ? recortar(texto) : fechaCorta(f);
}

/** Un valor en palabras. Vacío o nulo, "—". Una foto, sin su ruta. */
function valorLegible(k: string, v: unknown): string {
  if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) return VACIO;
  if (esFoto(k)) return T.panelRegistro.adjunta;
  if (typeof v === 'boolean') return v ? T.panelRegistro.si : T.panelRegistro.no;
  if (Array.isArray(v)) return v.length ? recortar(v.map((x) => valorLegible('', x)).join(', ')) : VACIO;
  if (esObjeto(v)) {
    const partes = clavesVisibles(v, true).map((c) => T.panelRegistro.valor(nombreDe(c), valorLegible(c, v[c])));
    return partes.length ? recortar(partes.join(', ')) : VACIO;
  }
  const texto = String(v);
  switch (k) {
    case 'caudal':
      return nombreCaudal(texto);
    case 'racor':
      return nombreRacor(texto);
    case 'tipo':
      return deTabla<TipoPunto>(nombreTipo, texto);
    case 'diametro_mm':
      return T.formato.mm(texto);
    case 'situacion':
      return deTabla(T.panelRegistro.situaciones, texto);
    case 'operacion':
      return deTabla(ETIQUETA_OPERACION, texto);
    case 'fecha_ultima_revision':
      return fechaLegible(texto);
    default:
      return recortar(texto);
  }
}

/** Las claves que se enseñan: primero las de la tabla, en su orden; después las demás, tal cual. */
function clavesVisibles(o: Objeto, anidada = false): string[] {
  const claves = Object.keys(o).filter((k) => !ignorada(k, anidada));
  const conocidas = ORDEN.filter((k) => claves.includes(k));
  const otras = claves.filter((k) => !conNombre(k)).sort();
  return [...conocidas, ...otras];
}

const iguales = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const metrosLegibles = (m: number) => String(Math.round(m * 10) / 10).replace('.', ',');

/**
 * "Movido N m". El desplazamiento que anotó la base de datos se enseña siempre; si no lo anotó,
 * se calcula entre las dos posiciones y, por debajo de 0,5 m, no se enseña.
 */
function movido(antes: Objeto, despues: Objeto): string | null {
  const anotado = numero(despues.desplazamiento_m);
  if (anotado !== null) return T.panelRegistro.movido(metrosLegibles(anotado));
  const [la, lo, ld, nd] = [numero(antes.lat), numero(antes.lng), numero(despues.lat), numero(despues.lng)];
  if (la === null || lo === null || ld === null || nd === null) return null;
  const m = metros({ lat: la, lng: lo }, { lat: ld, lng: nd });
  return m >= MOVIMIENTO_MINIMO_M ? T.panelRegistro.movido(metrosLegibles(m)) : null;
}

function cambios(antes: Objeto, despues: Objeto): string[] {
  const partes = clavesVisibles(despues)
    .filter((k) => !Object.hasOwn(antes, k) || !iguales(antes[k], despues[k]))
    .map((k) => {
      if (esFoto(k)) return T.panelRegistro.valor(nombreDe(k), T.panelRegistro.cambiada);
      if (!Object.hasOwn(antes, k)) return T.panelRegistro.valor(nombreDe(k), valorLegible(k, despues[k]));
      return T.panelRegistro.cambio(nombreDe(k), valorLegible(k, antes[k]), valorLegible(k, despues[k]));
    });
  const m = movido(antes, despues);
  if (m) partes.push(m);
  return partes;
}

const sinVacios = (partes: string[]) => partes.filter((v) => v !== VACIO);

/** Un alta o una restauración del punto entero: "Boca de riego · 45 mm · Bueno · Barrio Seco". */
const resumenPunto = (p: Objeto) =>
  sinVacios((['tipo', 'diametro_mm', 'caudal', 'nucleo'] as const).map((k) => valorLegible(k, p[k])));

const comoValores = (o: Objeto) =>
  clavesVisibles(o).map((k) => T.panelRegistro.valor(nombreDe(k), valorLegible(k, o[k])));

/** Un borrado o una purga (solo `antes`): qué punto era y, si lo hay, el motivo. */
function soloAntes(antes: Objeto): string[] {
  const partes: string[] = [];
  const codigo = valorLegible('codigo', antes.codigo);
  if (codigo !== VACIO) partes.push(T.panelRegistro.valor(nombreDe('codigo'), codigo));
  partes.push(valorLegible('tipo', antes.tipo));
  if (antes.motivo !== undefined)
    partes.push(T.panelRegistro.valor(nombreDe('motivo'), valorLegible('motivo', antes.motivo)));
  return sinVacios(partes);
}

/** `resumen` de v_registro sin "acción · código" (ya tienen su columna) ni las claves que no se enseñan. */
function resumenSinPrefijo(e: EntradaRegistro): string {
  let r = (e.resumen ?? '').trim();
  for (const prefijo of [e.accion, e.codigo]) {
    if (!prefijo) continue;
    if (r === prefijo) r = '';
    else if (r.startsWith(prefijo + SEPARADOR)) r = r.slice(prefijo.length + SEPARADOR.length);
  }
  const claves = r
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k && !ignorada(k, false));
  return claves.length ? claves.join(', ') : VACIO;
}

/** El detalle legible de una entrada del Registro (docs/30 RV-127). Función pura. */
export function detalleLegible(e: EntradaRegistro): string {
  const antes = esObjeto(e.antes) ? e.antes : null;
  const despues = esObjeto(e.despues) ? e.despues : null;
  let partes: string[] = [];
  if (antes && despues) {
    partes = cambios(antes, despues);
    // Dos puntos enteros iguales: decirlo, no listar todas sus claves como si hubieran cambiado.
    if (!partes.length && esPunto(antes) && esPunto(despues)) return T.panelRegistro.sinCambios;
  } else if (despues) partes = esPunto(despues) ? resumenPunto(despues) : comoValores(despues);
  else if (antes) partes = soloAntes(antes);
  return partes.length ? partes.join(SEPARADOR) : resumenSinPrefijo(e);
}
