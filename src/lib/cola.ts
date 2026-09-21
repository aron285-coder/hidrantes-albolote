// Cola de envíos del móvil (FR-82–FR-84, 05 §10). Toda propuesta pasa por aquí, haya cobertura o no:
// se guarda con su foto en IndexedDB y se envía en orden: url-subida → PUT de la foto → fn_proponer.
// La marca `clave_local` es la misma en cada reintento, así que nada se duplica (FR-49).

import { SIN_SERVIDOR, rpc } from './api';
import { type AlmacenCola, almacenCola } from './bd';
import { anotarServidor, espera, registrarComprobacion, reintentarAhora } from './conexion';
import type { ArgumentosPropuesta } from './propuestas';
import { leerSesion } from './sesion';
import { supabase } from './supabase';

export interface EnCola {
  clave_local: string;
  creada_en: number;
  args: ArgumentosPropuesta;
  foto: Blob | null;
  foto_path: string | null;
  /** Código del punto, o null en un alta, para enseñarlo en Mis propuestas. */
  codigo: string | null;
  intentos: number;
  proximo: number;
  /** Error permanente (05 §8): no se reintenta y se enseña al voluntario. */
  fallo: string | null;
}

export interface Enviada {
  clave_local: string;
  estado: 'pendiente' | 'aprobada';
  aplicada: boolean;
  codigo: string | null;
}

/** Errores que no se arreglan reintentando: se muestran (FR-84, TR-36). */
const PERMANENTES = [
  'PAYLOAD_INVALIDO',
  'FOTO_OBLIGATORIA',
  'PUNTO_NO_ENCONTRADO',
  'PUNTO_NO_ACTIVO',
  'NO_AUTORIZADO',
  'ERROR_INTERNO',
];
export const esPermanente = (codigo: string) => PERMANENTES.some((p) => codigo.startsWith(p));

const HORA = 3600_000;
/** Aviso de envío atascado (FR-83). */
export const ATASCADO_MS = 24 * HORA;

let almacen: AlmacenCola<EnCola> | null = null;
const bd = () => (almacen ??= almacenCola<EnCola>());

let items: EnCola[] = [];
let cargada = false;
const oyentes = new Set<() => void>();
const alEnviar = new Set<(e: Enviada) => void>();

function publicar(nuevos: EnCola[]) {
  items = [...nuevos].sort((a, b) => a.creada_en - b.creada_en);
  oyentes.forEach((o) => o());
}

export const colaActual = () => items;
export function suscribirCola(o: () => void): () => void {
  oyentes.add(o);
  return () => oyentes.delete(o);
}
/** Para refrescar el mapa (jefatura) o Mis propuestas cuando algo sale. */
export function alEnviarPropuesta(f: (e: Enviada) => void): () => void {
  alEnviar.add(f);
  return () => alEnviar.delete(f);
}

export const atascados = (ahora = Date.now()) => items.filter((i) => ahora - i.creada_en > ATASCADO_MS);

export async function cargarCola(): Promise<void> {
  try {
    publicar(await bd().todos());
  } catch {
    // sin IndexedDB, la cola vive en memoria
  }
  cargada = true;
}

async function guardar(item: EnCola) {
  publicar([...items.filter((i) => i.clave_local !== item.clave_local), item]);
  try {
    await bd().guardar(item);
  } catch {
    // en memoria sigue
  }
}

async function quitar(clave: string) {
  publicar(items.filter((i) => i.clave_local !== clave));
  try {
    await bd().quitar(clave);
  } catch {
    // ya no estaba
  }
}

/** Guarda la propuesta con su foto y trata de enviarla ya. */
export async function encolar(args: ArgumentosPropuesta, foto: Blob | null, codigo: string | null): Promise<void> {
  if (!cargada) await cargarCola();
  await guardar({
    clave_local: args.clave_local,
    creada_en: Date.now(),
    args,
    foto,
    foto_path: null,
    codigo,
    intentos: 0,
    proximo: 0,
    fallo: null,
  });
  void procesarCola();
}

/** Descartar a mano un envío con error permanente (Mis propuestas, con confirmación). */
export const descartar = (clave: string) => quitar(clave);

/** Cerrar sesión borra la cola (FL-12), avisando antes en Ajustes. */
export async function vaciarCola(): Promise<void> {
  publicar([]);
  try {
    await bd().vaciar();
  } catch {
    // nada guardado
  }
}

// ---------- envío ----------

type Credencial = { token: string } | { jwt: string };

async function credencial(): Promise<Credencial | null> {
  const s = leerSesion();
  if (s) return { token: s.token };
  const cliente = supabase();
  if (!cliente) return null;
  const { data } = await cliente.auth.getSession();
  return data.session ? { jwt: data.session.access_token } : null;
}

type Paso = { ok: true } | { ok: false; codigo: string };

async function subirFoto(item: EnCola, c: Credencial): Promise<Paso> {
  let reserva: Response;
  try {
    reserva = await fetch('/api/url-subida', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...('jwt' in c ? { Authorization: `Bearer ${c.jwt}` } : {}),
      },
      body: JSON.stringify('token' in c ? { token: c.token } : {}),
    });
  } catch {
    return { ok: false, codigo: SIN_SERVIDOR };
  }
  const cuerpo = (await reserva.json().catch(() => ({}))) as { foto_path?: string; url?: string; error?: string };
  if (!reserva.ok || !cuerpo.url || !cuerpo.foto_path) {
    return { ok: false, codigo: reserva.status >= 500 || !cuerpo.error ? SIN_SERVIDOR : cuerpo.error };
  }
  try {
    const subida = await fetch(cuerpo.url, {
      method: 'PUT',
      headers: { 'Content-Type': item.foto!.type || 'image/jpeg' },
      body: item.foto,
    });
    if (!subida.ok) return { ok: false, codigo: SIN_SERVIDOR };
  } catch {
    return { ok: false, codigo: SIN_SERVIDOR };
  }
  await guardar({ ...item, foto_path: cuerpo.foto_path });
  return { ok: true };
}

async function enviarUno(clave: string, c: Credencial): Promise<Paso> {
  let item = items.find((i) => i.clave_local === clave);
  if (!item) return { ok: true };
  if (item.foto && !item.foto_path) {
    const r = await subirFoto(item, c);
    if (!r.ok) return r;
    item = items.find((i) => i.clave_local === clave)!;
  }
  const r = await rpc<{ estado: 'pendiente' | 'aprobada'; aplicada: boolean; codigo: string | null }>('fn_proponer', {
    ...item.args,
    token: 'token' in c ? c.token : null,
    foto_path: item.foto_path,
  });
  if (!r.ok) {
    if (r.codigo === 'FOTO_NO_RESERVADA' && item.foto) {
      // La reserva caducó o se perdió: se sube otra vez en el siguiente intento.
      await guardar({ ...item, foto_path: null });
    }
    return r;
  }
  await quitar(clave);
  alEnviar.forEach((f) =>
    f({ clave_local: clave, estado: r.datos.estado, aplicada: r.datos.aplicada, codigo: r.datos.codigo }),
  );
  return { ok: true };
}

let procesando: Promise<void> | null = null;
let temporizador: ReturnType<typeof setTimeout> | undefined;

/** Siguiente reintento programado: el más cercano de los que esperan su turno (retroceso). */
function programar() {
  clearTimeout(temporizador);
  const ahora = Date.now();
  const futuros = items.filter((i) => !i.fallo && i.proximo > ahora).map((i) => i.proximo);
  if (!futuros.length) return;
  temporizador = setTimeout(() => void procesarCola(), Math.max(1000, Math.min(...futuros) - ahora));
}

/** Envía todo lo que toca, de uno en uno y en orden. Seguro de llamar muchas veces. */
export function procesarCola(): Promise<void> {
  procesando ??= (async () => {
    // Ceder una vez antes de nada: si el cuerpo terminara sin ningún await, el finally pondría
    // procesando = null antes de que ??= guarde la promesa, y la cola se quedaría bloqueada.
    await Promise.resolve();
    try {
      if (!cargada) await cargarCola();
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const c = await credencial();
      if (!c) return;
      for (const pendiente of [...items]) {
        if (pendiente.fallo || pendiente.proximo > Date.now()) continue;
        const r = await enviarUno(pendiente.clave_local, c);
        if (r.ok) continue;
        const actual = items.find((i) => i.clave_local === pendiente.clave_local);
        if (!actual) continue;
        if (r.codigo.startsWith('TOKEN_')) {
          // Acceso caducado o revocado: lo resuelve acceso (vuelta a la entrada); la cola espera.
          void reintentarAhora();
          return;
        }
        if (esPermanente(r.codigo)) {
          await guardar({ ...actual, fallo: r.codigo });
          continue;
        }
        const intentos = actual.intentos + 1;
        const retraso = r.codigo === 'CUOTA_SUBIDAS_AGOTADA' ? HORA : espera(intentos);
        await guardar({ ...actual, intentos, proximo: Date.now() + retraso });
        if (r.codigo === SIN_SERVIDOR) {
          anotarServidor(false);
          break; // sin servidor no tiene sentido probar los siguientes
        }
      }
    } finally {
      procesando = null;
      programar();
    }
  })();
  return procesando;
}

/**
 * Vuelve la red o se pulsa "Reintentar": se olvida el retroceso y se intenta ya todo lo pendiente.
 * El retroceso es para no insistir contra un servidor caído, no para hacer esperar al volver la señal.
 */
export async function reintentarCola(): Promise<void> {
  if (!cargada) await cargarCola();
  for (const i of items) if (!i.fallo && i.proximo > 0) await guardar({ ...i, proximo: 0 });
  await procesarCola();
}

/** Arranque: carga la cola y la engancha a los reintentos de la conexión y a la vuelta de la red. */
export function iniciarCola(): void {
  void cargarCola().then(procesarCola);
  registrarComprobacion(reintentarCola);
  if (typeof window !== 'undefined') window.addEventListener('online', () => void reintentarCola());
}

/** Solo para los tests. */
export function _usarAlmacenCola(a: AlmacenCola<EnCola>) {
  almacen = a;
  items = [];
  cargada = false;
  procesando = null;
  clearTimeout(temporizador);
  oyentes.clear();
  alEnviar.clear();
}
