// Avisos push del voluntario (FR-163): opcionales y apagados por defecto. Se explica antes de pedir
// permiso; en iPhone solo funcionan con la app instalada. Suscripción con fn_guardar_suscripcion_push;
// el envío lo hace el Worker de avisos (DEC-097), y el móvil también lo pide tras cada sincronización.
//
// Activar nunca falla en silencio (docs/21 RV-81, UI-05, UI-06): cada camino que no acaba en
// "activo" devuelve un motivo que la hoja enseña, y los que no dependen del voluntario quedan
// anotados para jefatura con anotarError. Nunca se anota el endpoint ni las claves de la suscripción.

import { SIN_SERVIDOR, rpc } from './api';
import { escribir, leer } from './almacen';
import { anotarError } from './errores';
import { conLimite } from './red';
import { leerSesion } from './sesion';
import { T } from './textos';

const CLAVE = 'push';
/** Última vez que se volvió a enviar la suscripción al servidor (RV-81 punto 4). */
const CLAVE_RESINCRONIZADA = 'push_resincronizado_en';
const PUBLICA = import.meta.env.VITE_VAPID_PUBLIC_KEY;

/** Base de datos propia del Service Worker (public/sw-push.js): la suscripción nueva que dejó un `pushsubscriptionchange`. */
export const BD_SW = { nombre: 'hidrantes-sw', almacen: 'kv', pendiente: 'push_pendiente' } as const;

/** Límite de espera a que el Service Worker esté listo (RV-81). */
export const LIMITE_SW_MS = 10_000;
/** Cada cuánto, como mucho, se vuelve a enviar la suscripción tras sincronizar. */
export const RESINCRONIZAR_CADA_MS = 24 * 60 * 60 * 1000;
/** Con una suscripción nueva del SW pendiente de enviar: como mucho un intento por hora. */
export const REINTENTO_PENDIENTE_MS = 60 * 60 * 1000;

export type EstadoPush = 'no_disponible' | 'instalar_primero' | 'denegado' | 'activo' | 'inactivo';

export type MotivoPush =
  | 'permiso_no_concedido'
  | 'permiso_bloqueado'
  | 'sin_servicio_push'
  | 'sin_service_worker'
  | 'clave_distinta'
  | `servidor:${string}`;

export interface ResultadoPush {
  estado: EstadoPush;
  motivo?: MotivoPush;
}

const esIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalada = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function estadoPush(): EstadoPush {
  const soportado = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!PUBLICA || !leerSesion()) return 'no_disponible';
  if (!soportado) return esIos() && !instalada() ? 'instalar_primero' : 'no_disponible';
  if (Notification.permission === 'denied') return 'denegado';
  return leer<boolean>(CLAVE) ? 'activo' : 'inactivo';
}

function claveBinaria(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  const bin = atob(b64);
  const salida = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) salida[i] = bin.charCodeAt(i);
  return salida;
}

/** ¿La suscripción se hizo con otra clave VAPID? Si el navegador no la dice, se da por buena. */
function otraClave(s: PushSubscription, clave: Uint8Array): boolean {
  const suya = s.options?.applicationServerKey;
  if (!suya) return false;
  const a = new Uint8Array(suya);
  return a.length !== clave.length || a.some((b, i) => b !== clave[i]);
}

/** Solo el nombre y el mensaje del error, nunca la suscripción. */
function errorSinDatos(e: unknown, donde: string): Error {
  const nombre = e instanceof Error ? e.name : typeof e;
  const mensaje = e instanceof Error ? e.message : String(e);
  return new Error(`${donde}: ${nombre}: ${mensaje}`.slice(0, 500));
}

/** `navigator.serviceWorker.ready` puede no resolverse nunca: con límite, para no dejar el botón colgado (UI-02). */
function registroListo(limiteMs: number): Promise<ServiceWorkerRegistration> {
  const limite = conLimite(limiteMs);
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, rechazar) =>
      limite.addEventListener('abort', () => rechazar(new Error('serviceWorker.ready sin resolver')), {
        once: true,
      }),
    ),
  ]);
}

type Suscrita = { ok: true; suscripcion: PushSubscription } | { ok: false; motivo: MotivoPush };

/** La suscripción de este móvil con la clave vigente: la que hay, o una nueva. */
async function suscribir(registro: ServiceWorkerRegistration, clave: Uint8Array<ArrayBuffer>): Promise<Suscrita> {
  let actual: PushSubscription | null;
  try {
    actual = await registro.pushManager.getSubscription();
  } catch (e) {
    anotarError(errorSinDatos(e, 'getSubscription'), 'push:subscribe');
    return { ok: false, motivo: 'sin_servicio_push' };
  }
  if (actual && otraClave(actual, clave)) {
    try {
      await actual.unsubscribe();
      const nueva = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
      return { ok: true, suscripcion: nueva };
    } catch (e) {
      anotarError(errorSinDatos(e, 'clave distinta'), 'push:subscribe');
      return { ok: false, motivo: 'clave_distinta' };
    }
  }
  if (actual) return { ok: true, suscripcion: actual };
  try {
    const nueva = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
    return { ok: true, suscripcion: nueva };
  } catch (e) {
    anotarError(errorSinDatos(e, 'subscribe'), 'push:subscribe');
    return { ok: false, motivo: 'sin_servicio_push' };
  }
}

async function guardarEnServidor(token: string, suscripcion: PushSubscriptionJSON): Promise<MotivoPush | null> {
  const r = await rpc('fn_guardar_suscripcion_push', { token, suscripcion, temas: ['resultado_propuesta'] });
  if (r.ok) return null;
  // Sin cobertura no es un fallo de la aplicación: el voluntario lo ve, jefatura no necesita saberlo.
  if (r.codigo !== SIN_SERVIDOR) {
    anotarError(new Error(`fn_guardar_suscripcion_push: ${r.codigo}`.slice(0, 500)), 'push:guardar');
  }
  return `servidor:${r.codigo}`;
}

/**
 * Pide permiso, se suscribe y lo guarda en el servidor. Nunca lanza: devuelve el estado final y, si
 * no ha quedado activo, el motivo. `limiteSwMs` solo se cambia en los tests.
 */
export async function activarPush({ limiteSwMs = LIMITE_SW_MS } = {}): Promise<ResultadoPush> {
  const sesion = leerSesion();
  if (!sesion || !PUBLICA) return { estado: 'no_disponible' };
  try {
    const permiso = await Notification.requestPermission();
    if (permiso === 'denied') return { estado: 'denegado', motivo: 'permiso_bloqueado' };
    // Chrome deja de preguntar tras varios rechazos y devuelve `default` sin enseñar nada.
    if (permiso !== 'granted') return { estado: 'inactivo', motivo: 'permiso_no_concedido' };
    let registro: ServiceWorkerRegistration;
    try {
      registro = await registroListo(limiteSwMs);
    } catch (e) {
      anotarError(errorSinDatos(e, 'serviceWorker.ready'), 'push:sw');
      return { estado: 'inactivo', motivo: 'sin_service_worker' };
    }
    const s = await suscribir(registro, claveBinaria(PUBLICA));
    if (!s.ok) return { estado: 'inactivo', motivo: s.motivo };
    const fallo = await guardarEnServidor(sesion.token, s.suscripcion.toJSON());
    if (fallo) return { estado: 'inactivo', motivo: fallo };
    escribir(CLAVE, true);
    escribir(CLAVE_RESINCRONIZADA, Date.now());
    return { estado: 'activo' };
  } catch (e) {
    // Lo imprevisto (un navegador con la API a medias) también se dice y queda anotado.
    anotarError(errorSinDatos(e, 'activar'), 'push:activar');
    return { estado: 'inactivo', motivo: 'sin_servicio_push' };
  }
}

export async function desactivarPush(): Promise<EstadoPush> {
  escribir(CLAVE, false);
  try {
    const registro = await registroListo(LIMITE_SW_MS);
    await (await registro.pushManager.getSubscription())?.unsubscribe();
  } catch (e) {
    // Sin suscripción local o sin Service Worker: el servidor la borra igualmente, pero queda anotado.
    anotarError(errorSinDatos(e, 'unsubscribe'), 'push:desactivar');
  }
  const sesion = leerSesion();
  if (sesion) {
    const r = await rpc('fn_borrar_suscripcion_push', { token: sesion.token });
    if (!r.ok && r.codigo !== SIN_SERVIDOR) {
      anotarError(new Error(`fn_borrar_suscripcion_push: ${r.codigo}`.slice(0, 500)), 'push:desactivar');
    }
  }
  return estadoPush();
}

function conBdSw<T>(modo: IDBTransactionMode, hacer: (a: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return new Promise((resolver) => {
    if (typeof indexedDB === 'undefined') return resolver(null);
    const p = indexedDB.open(BD_SW.nombre, 1);
    p.onupgradeneeded = () => p.result.createObjectStore(BD_SW.almacen);
    p.onerror = () => resolver(null);
    p.onsuccess = () => {
      const bd = p.result;
      try {
        const peticion = hacer(bd.transaction(BD_SW.almacen, modo).objectStore(BD_SW.almacen));
        peticion.onsuccess = () => resolver(peticion.result ?? null);
        peticion.onerror = () => resolver(null);
      } catch {
        resolver(null);
      } finally {
        bd.close();
      }
    };
  });
}

/**
 * Tras una sincronización buena (RV-81 punto 4): si los avisos están activos en este móvil, se
 * vuelve a enviar la suscripción, como mucho una vez cada 24 h. Así se recupera una fila que el
 * servidor borró. Si el Service Worker dejó una suscripción nueva (`pushsubscriptionchange`), se
 * envía ya, sin esperar a las 24 h. Sin permiso, sin avisos o sin red no hace nada ni molesta.
 */
export async function resincronizarPush(token: string, ahora = Date.now()): Promise<void> {
  if (!PUBLICA || !leer<boolean>(CLAVE)) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;
  try {
    // La suscripción nueva que dejó el SW, o `true` si no pudo hacerla; basta con saber que hay algo.
    const pendiente = await conBdSw<PushSubscriptionJSON | true>('readonly', (a) => a.get(BD_SW.pendiente));
    const ultima = leer<number>(CLAVE_RESINCRONIZADA) ?? 0;
    // Con una marca del SW se reintenta cada hora, no cada día; sin ella, una vez al día.
    if (ahora - ultima < (pendiente ? REINTENTO_PENDIENTE_MS : RESINCRONIZAR_CADA_MS)) return;
    // Se marca el intento, salga como salga: un fallo que se repite no llena de errores a jefatura.
    escribir(CLAVE_RESINCRONIZADA, ahora);
    const registro = await registroListo(LIMITE_SW_MS);
    const s = await suscribir(registro, claveBinaria(PUBLICA));
    if (!s.ok) return;
    const fallo = await guardarEnServidor(token, s.suscripcion.toJSON());
    if (!fallo && pendiente) await conBdSw('readwrite', (a) => a.delete(BD_SW.pendiente));
  } catch (e) {
    anotarError(errorSinDatos(e, 'resincronizar'), 'push:resincronizar');
  }
}

/** Qué ha pasado y qué puede hacer el voluntario, por motivo (RV-81, UI-04). */
export function textoMotivoPush(motivo: MotivoPush): string {
  switch (motivo) {
    case 'permiso_no_concedido':
      return T.push.permisoNoConcedido;
    case 'permiso_bloqueado':
      return T.push.permisoBloqueado;
    case 'sin_servicio_push':
      return T.push.sinServicioPush;
    case 'sin_service_worker':
      return T.push.sinServiceWorker;
    case 'clave_distinta':
      return T.push.claveDistinta;
    default:
      return motivo === `servidor:${SIN_SERVIDOR}` ? T.push.servidorSinConexion : T.push.servidorNoGuarda;
  }
}

/** Con el permiso bloqueado, reintentar desde aquí no cambia nada (UI-01): se arregla en los ajustes del móvil. */
export const sePuedeReintentar = (motivo: MotivoPush) => motivo !== 'permiso_bloqueado';

/** Tras sincronizar: que el servidor envíe los avisos pendientes de todos (05 §9). Sin esperar. */
export function pedirEnvioPush(token: string): void {
  void fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  }).catch(() => undefined);
}
