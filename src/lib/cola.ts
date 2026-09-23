// Cola de envíos del móvil (FR-82–FR-84, 05 §10). Toda propuesta pasa por aquí, haya cobertura o no:
// se guarda con su foto en IndexedDB y se envía en orden: url-subida → PUT de la foto → fn_proponer.
// La marca `clave_local` es la misma en cada reintento, así que nada se duplica (FR-49).

import { SIN_SERVIDOR, rpc } from './api';
import { type AlmacenCola, almacenCola } from './bd';
import { escribir } from './almacen';
import { anotarServidor, espera, registrarComprobacion, reintentarAhora } from './conexion';
import { anotarError } from './errores';
import type { ArgumentosPropuesta } from './propuestas';
import { pedirEnvioComoJefatura } from './panel/push-jefatura';
import { pedirEnvioPush } from './push';
import { LIMITES_RED, conLimite } from './red';
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
  /** Intentos seguidos con un error que no es de paso (RV-03); ausente en envíos guardados antes. */
  fallos_seguidos?: number;
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
  'DIAMETRO_SIN_FIJAR',
];
export const esPermanente = (codigo: string) => PERMANENTES.some((p) => codigo.startsWith(p));

/**
 * Errores de paso: se reintentan con retroceso sin límite. NO_AUTORIZADO es la sesión de jefatura
 * caducada, que comprobarAcceso resuelve; FOTO_NO_RESERVADA se arregla subiendo otra vez la foto.
 * Cualquier otro (DESCONOCIDO, ERROR_INTERNO…) también se reintenta, pero a los cinco seguidos se
 * marca fallo: así no se insiste para siempre y el envío sigue siendo recuperable a mano (RV-03).
 */
const TRANSITORIOS = [SIN_SERVIDOR, 'CUOTA_SUBIDAS_AGOTADA', 'NO_AUTORIZADO', 'FOTO_NO_RESERVADA'];
export const MAX_FALLOS_SEGUIDOS = 5;

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
    const guardados = await bd().todos();
    for (const i of guardados) persistidas.add(i.clave_local);
    publicar(guardados);
  } catch {
    // sin IndexedDB, la cola vive en memoria
  }
  cargada = true;
}

let errorGuardadoAnotado = false;
/** Envíos que llegaron a IndexedDB en su último guardado (RV-02, docs/18 RV-39). */
const persistidas = new Set<string>();

/** Si un envío está guardado en el móvil o solo en memoria ("Solo en memoria", RV-02). */
export const estaPersistida = (clave: string) => persistidas.has(clave);

/**
 * Publica en memoria y escribe en IndexedDB. Nunca lanza: sin IndexedDB (navegación privada, cuota
 * agotada) se puede enviar igual con cobertura. Devuelve si quedó guardado en el móvil (RV-02); el
 * primer fallo de la sesión se anota para que llegue a errores_cliente.
 *
 * Con `gen`, no escribe nada si la cola se vació desde entonces, y deshace lo escrito si se vació
 * mientras escribía: un reintento en vuelo no resucita envíos de una sesión cerrada (RV-04, RV-39).
 */
async function guardar(item: EnCola, gen?: number): Promise<boolean> {
  if (gen !== undefined && gen !== generacion) return false;
  publicar([...items.filter((i) => i.clave_local !== item.clave_local), item]);
  try {
    await bd().guardar(item);
    if (gen !== undefined && gen !== generacion) {
      await bd()
        .quitar(item.clave_local)
        .catch(() => undefined);
      return false;
    }
    persistidas.add(item.clave_local);
    return true;
  } catch (e) {
    persistidas.delete(item.clave_local);
    if (!errorGuardadoAnotado) {
      errorGuardadoAnotado = true;
      anotarError(e, 'cola');
    }
    return false;
  }
}

async function quitar(clave: string) {
  persistidas.delete(clave);
  publicar(items.filter((i) => i.clave_local !== clave));
  try {
    await bd().quitar(clave);
  } catch {
    // ya no estaba
  }
}

/**
 * Guarda la propuesta con su foto y trata de enviarla ya. `persistida: false` quiere decir que solo
 * está en memoria: si la aplicación se cierra antes de enviarla, se pierde (RV-02).
 */
export async function encolar(
  args: ArgumentosPropuesta,
  foto: Blob | null,
  codigo: string | null,
): Promise<{ persistida: boolean }> {
  if (!cargada) await cargarCola();
  const persistida = await guardar({
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
  return { persistida };
}

/** Descartar a mano un envío con error permanente (Mis propuestas, con confirmación). */
export const descartar = (clave: string) => quitar(clave);

/**
 * Generación de la cola: vaciarla la cambia, y un envío que estaba en vuelo al cerrar sesión ya no
 * escribe nada al volver ni se manda con el token viejo (RV-04, FL-12, FR-27).
 */
let generacion = 0;
const COLA_VACIADA = 'COLA_VACIADA';

/** Cerrar sesión borra la cola (FL-12), avisando antes en Ajustes. */
export async function vaciarCola(): Promise<void> {
  generacion++;
  persistidas.clear();
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

async function subirFoto(item: EnCola, c: Credencial, gen: number): Promise<Paso> {
  let reserva: Response;
  try {
    reserva = await fetch('/api/url-subida', {
      method: 'POST',
      signal: conLimite(LIMITES_RED.reserva),
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
      signal: conLimite(LIMITES_RED.foto),
      headers: { 'Content-Type': item.foto!.type || 'image/jpeg' },
      body: item.foto,
    });
    if (!subida.ok) return { ok: false, codigo: SIN_SERVIDOR };
  } catch {
    return { ok: false, codigo: SIN_SERVIDOR };
  }
  // Si la cola se vació mientras subía, o el envío ya no está, no se resucita nada.
  const actual = items.find((i) => i.clave_local === item.clave_local);
  if (gen !== generacion || !actual) return { ok: false, codigo: COLA_VACIADA };
  await guardar({ ...actual, foto_path: cuerpo.foto_path });
  return { ok: true };
}

async function enviarUno(clave: string, c: Credencial, gen: number): Promise<Paso> {
  let item = items.find((i) => i.clave_local === clave);
  if (!item) return { ok: true };
  if (item.foto && !item.foto_path) {
    const r = await subirFoto(item, c, gen);
    if (!r.ok) return r;
    item = items.find((i) => i.clave_local === clave)!;
  }
  if (gen !== generacion) return { ok: false, codigo: COLA_VACIADA };
  const r = await rpc<{ estado: 'pendiente' | 'aprobada'; aplicada: boolean; codigo: string | null }>('fn_proponer', {
    ...item.args,
    token: 'token' in c ? c.token : null,
    foto_path: item.foto_path,
  });
  if (gen !== generacion) return { ok: false, codigo: COLA_VACIADA };
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
/** Algo salió bien en esta llamada: al terminar se pide el envío de avisos, una sola vez (RV-08). */
let huboEnvio: Credencial | null = null;
/** Alguien pidió enviar mientras había una vuelta en curso: al terminarla se da otra (RV-01). */
let otraVuelta = false;
let temporizador: ReturnType<typeof setTimeout> | undefined;

/** Siguiente reintento programado: el más cercano de los que esperan su turno (retroceso). */
function programar() {
  clearTimeout(temporizador);
  const ahora = Date.now();
  const futuros = items.filter((i) => !i.fallo && i.proximo > ahora).map((i) => i.proximo);
  if (!futuros.length) return;
  temporizador = setTimeout(() => void procesarCola(), Math.max(1000, Math.min(...futuros) - ahora));
}

/**
 * Una pasada por la cola en orden. `parar`: no tiene sentido seguir ahora (sin acceso, sin
 * servidor). `reiniciar`: la cola se vació durante la vuelta (cierre de sesión); lo de esta vuelta
 * ya no vale, pero si alguien pidió otra (una propuesta de la sesión nueva) se da (docs/18 RV-39).
 */
async function unaVuelta(c: Credencial, gen: number): Promise<'seguir' | 'parar' | 'reiniciar'> {
  for (const pendiente of [...items]) {
    if (gen !== generacion) return 'reiniciar';
    const actual0 = items.find((i) => i.clave_local === pendiente.clave_local);
    if (!actual0 || actual0.fallo || actual0.proximo > Date.now()) continue;
    const r = await enviarUno(pendiente.clave_local, c, gen);
    if (r.ok) {
      huboEnvio = c;
      continue;
    }
    if (r.codigo === COLA_VACIADA || gen !== generacion) return 'reiniciar';
    const actual = items.find((i) => i.clave_local === pendiente.clave_local);
    if (!actual) continue;
    if (r.codigo.startsWith('TOKEN_')) {
      // Acceso caducado o revocado: lo resuelve acceso (vuelta a la entrada); la cola espera.
      void reintentarAhora();
      return 'parar';
    }
    if (esPermanente(r.codigo)) {
      await guardar({ ...actual, fallo: r.codigo });
      continue;
    }
    const transitorio = TRANSITORIOS.some((t) => r.codigo.startsWith(t));
    const fallos_seguidos = transitorio ? 0 : (actual.fallos_seguidos ?? 0) + 1;
    if (fallos_seguidos >= MAX_FALLOS_SEGUIDOS) {
      await guardar({ ...actual, fallo: r.codigo, fallos_seguidos });
      continue;
    }
    const intentos = actual.intentos + 1;
    const retraso = r.codigo === 'CUOTA_SUBIDAS_AGOTADA' ? HORA : espera(intentos);
    await guardar({ ...actual, intentos, fallos_seguidos, proximo: Date.now() + retraso });
    if (r.codigo === SIN_SERVIDOR) {
      anotarServidor(false);
      return 'parar'; // sin servidor no tiene sentido probar los siguientes
    }
  }
  return 'seguir';
}

/**
 * Envía todo lo que toca, de uno en uno y en orden. Seguro de llamar muchas veces: una llamada
 * durante una vuelta devuelve la misma promesa, que no se resuelve hasta dar otra vuelta más. Así
 * `await procesarCola()` tras encolar espera también a lo recién encolado.
 */
export function procesarCola(): Promise<void> {
  if (procesando) {
    otraVuelta = true;
    return procesando;
  }
  procesando = (async () => {
    // Ceder una vez antes de nada: si el cuerpo terminara sin ningún await, el finally pondría
    // procesando = null antes de que se guarde la promesa, y la cola se quedaría bloqueada.
    await Promise.resolve();
    try {
      if (!cargada) await cargarCola();
      // otraVuelta se apaga al empezar cada vuelta: solo se repite si alguien llamó durante ella.
      do {
        otraVuelta = false;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
        const gen = generacion;
        const c = await credencial();
        if (!c) break;
        const vuelta = await unaVuelta(c, gen);
        if (vuelta === 'parar') break;
        // Tras un cierre de sesión en vuelo, solo se sigue si alguien pidió otra vuelta (RV-39).
        if (vuelta === 'reiniciar' && !otraVuelta) break;
      } while (otraVuelta);
    } finally {
      procesando = null;
      otraVuelta = false;
      programar();
      // "Nueva propuesta" a jefatura sale al momento, no a los 15 minutos de avisos.yml.
      if (huboEnvio) pedirAvisos(huboEnvio);
      huboEnvio = null;
    }
  })();
  return procesando;
}

function pedirAvisos(c: Credencial) {
  if ('token' in c) pedirEnvioPush(c.token);
  else void pedirEnvioComoJefatura();
}

/**
 * Vuelve la red o se pulsa "Reintentar": se olvida el retroceso y se intenta ya todo lo pendiente.
 * El retroceso es para no insistir contra un servidor caído, no para hacer esperar al volver la señal.
 */
export async function reintentarCola(): Promise<void> {
  if (!cargada) await cargarCola();
  const gen = generacion;
  for (const i of items) {
    if (gen !== generacion) return;
    // Lo que solo estaba en memoria vuelve a intentar llegar a IndexedDB (RV-39).
    if (!i.fallo && (i.proximo > 0 || !persistidas.has(i.clave_local))) await guardar({ ...i, proximo: 0 }, gen);
  }
  if (gen !== generacion) return;
  await procesarCola();
}

/** "Reintentar" en un envío con fallo (Mis propuestas): se olvida el fallo y se intenta ya (RV-03). */
export async function reintentarFallido(clave: string): Promise<void> {
  if (!cargada) await cargarCola();
  const gen = generacion;
  const item = items.find((i) => i.clave_local === clave);
  if (!item) return;
  await guardar({ ...item, fallo: null, intentos: 0, fallos_seguidos: 0, proximo: 0 }, gen);
  if (gen !== generacion) return;
  await procesarCola();
}

/** Arranque: carga la cola y la engancha a los reintentos de la conexión y a la vuelta de la red. */
export function iniciarCola(): void {
  void cargarCola().then(procesarCola);
  pedirAlmacenPersistente();
  registrarComprobacion(reintentarCola);
  if (typeof window !== 'undefined') window.addEventListener('online', () => void reintentarCola());
}

/**
 * Pide al navegador que no desaloje la cola ni los puntos guardados (TR-07) y anota si lo concede,
 * para enseñarlo en Ajustes. Sin esperar: el navegador decide cuando quiere.
 */
function pedirAlmacenPersistente() {
  try {
    const almacenamiento = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!almacenamiento?.persist) return;
    void almacenamiento
      .persist()
      .then(() => almacenamiento.persisted())
      .then((si) => escribir('almacen_persistente', si))
      .catch(() => undefined);
  } catch {
    // sin API de almacenamiento: nada que pedir
  }
}

/** Solo para los tests. */
export function _usarAlmacenCola(a: AlmacenCola<EnCola>) {
  almacen = a;
  items = [];
  cargada = false;
  procesando = null;
  otraVuelta = false;
  huboEnvio = null;
  errorGuardadoAnotado = false;
  persistidas.clear();
  clearTimeout(temporizador);
  oyentes.clear();
  alEnviar.clear();
}
