// Avisos push para jefatura (FR-164): nuevas propuestas (agrupadas, como mucho una por hora) y
// resumen semanal de los lunes. Opcionales y apagados por defecto, como los del voluntario.

import { acceso } from '../acceso';
import { type Resultado, SIN_SERVIDOR, rpc } from '../api';
import { borrar, escribir, leer } from '../almacen';
import { anotarError } from '../errores';

import { jwt } from './consultas';

export type TemaJefatura = 'nuevas_propuestas' | 'resumen_semanal';
export type EstadoPushJefatura = 'no_disponible' | 'instalar_primero' | 'denegado' | 'listo';

const TEMAS: readonly TemaJefatura[] = ['nuevas_propuestas', 'resumen_semanal'];
const esTema = (t: unknown): t is TemaJefatura => TEMAS.includes(t as TemaJefatura);

/**
 * Donde hasta docs/31 se recordaban los temas en este navegador, sin saber de qué administrador
 * eran: con dos en el mismo navegador, uno veía los del otro (docs/32 RV-264). La clave vieja se
 * borra; los temas se preguntan al servidor y, como respaldo, se recuerdan por administrador en
 * `push_jefatura:<hash del correo>`, que se borra al cerrar la sesión de jefatura.
 */
const CLAVE_ANTIGUA = 'push_jefatura';
const PREFIJO_TEMAS = 'push_jefatura:';
const PUBLICA = import.meta.env.VITE_VAPID_PUBLIC_KEY;

/**
 * La clave de los temas de un administrador: un hash del correo (FNV-1a de 64 bits), para no dejar
 * el correo escrito en la clave. Basta con que no se confundan dos administradores.
 */
export function claveTemas(correo: string): string {
  let h = 0xcbf29ce484222325n;
  for (const c of new TextEncoder().encode(correo.trim().toLowerCase())) {
    h = BigInt.asUintN(64, (h ^ BigInt(c)) * 0x100000001b3n);
  }
  return PREFIJO_TEMAS + h.toString(16).padStart(16, '0');
}

/** El correo de jefatura con sesión ahora, o null. */
function correoJefatura(): string | null {
  const a = acceso();
  return a.tipo === 'jefatura' ? a.correo : null;
}

/** Lo que se recuerda de este administrador en este navegador (respaldo de `temasActivos`). */
function recordar(temas: TemaJefatura[]): void {
  const correo = correoJefatura();
  if (!correo) return;
  if (temas.length) escribir(claveTemas(correo), temas);
  else borrar(claveTemas(correo));
}

/** Borra lo que se recuerda de los avisos de jefatura en este navegador, de todos los administradores. */
export function olvidarTemasJefatura(): void {
  try {
    const claves: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(`hidrantes.${CLAVE_ANTIGUA}`)) claves.push(k);
    }
    for (const k of claves) localStorage.removeItem(k);
  } catch {
    // sin almacenamiento no hay nada que borrar
  }
}

/**
 * Los temas de jefatura que se recuerdan en este navegador para el administrador con sesión, sin
 * preguntar al servidor (lo usa `lib/push.ts` como respaldo, RV-258). Sin sesión de jefatura,
 * ninguno: lo recordado se borra al cerrarla. La verdad está en el servidor (`cargarTemas`).
 */
export function temasActivos(): TemaJefatura[] {
  const a = acceso();
  if (a.tipo !== 'jefatura') {
    // Sesión de jefatura cerrada (o nunca abierta): nada que recordar. Mientras se comprueba, se espera.
    if (a.tipo !== 'comprobando') olvidarTemasJefatura();
    return [];
  }
  const t = leer<unknown>(claveTemas(a.correo));
  return Array.isArray(t) ? t.filter(esTema) : [];
}

const esIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalada = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function estadoPushJefatura(): EstadoPushJefatura {
  const soportado = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!PUBLICA) return 'no_disponible';
  if (!soportado) return esIos() && !instalada() ? 'instalar_primero' : 'no_disponible';
  if (Notification.permission === 'denied') return 'denegado';
  return 'listo';
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

/** Límite de espera a que el Service Worker esté listo: `ready` puede no resolverse nunca. */
export const LIMITE_SW_MS = 10_000;

/** Solo el nombre y el mensaje del error, nunca la suscripción ni su endpoint. */
function errorSinDatos(e: unknown, donde: string): Error {
  const nombre = e instanceof Error ? e.name : typeof e;
  const mensaje = e instanceof Error ? e.message : String(e);
  return new Error(`push-jefatura · ${donde}: ${nombre}: ${mensaje}`.slice(0, 500));
}

function registroListo(limiteMs: number): Promise<ServiceWorkerRegistration> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, rechazar) => {
      t = setTimeout(() => rechazar(new Error('serviceWorker.ready sin resolver')), limiteMs);
    }),
  ]).finally(() => clearTimeout(t));
}

/** Anota lo que falla en una RPC, salvo la falta de cobertura, que no es un fallo de la aplicación. */
function anotarRpc(nombre: string, codigo: string) {
  if (codigo !== SIN_SERVIDOR) anotarError(new Error(`${nombre}: ${codigo}`.slice(0, 500)), 'push-jefatura');
}

/**
 * Los temas del administrador que ha entrado, en este navegador, según el servidor
 * (`fn_suscripcion_push_admin`, 0041, docs/32 RV-264). Sin suscripción en el navegador, ninguno. Nada
 * se recuerda en el navegador: con dos administradores en el mismo, cada uno ve solo los suyos.
 * `limiteSwMs` solo se cambia en los tests.
 */
export async function cargarTemas({ limiteSwMs = LIMITE_SW_MS } = {}): Promise<Resultado<TemaJefatura[]>> {
  borrar(CLAVE_ANTIGUA);
  if (estadoPushJefatura() !== 'listo') return { ok: true, datos: [] };
  let suscripcion: PushSubscription | null;
  try {
    suscripcion = await (await registroListo(limiteSwMs)).pushManager.getSubscription();
  } catch (e) {
    anotarError(errorSinDatos(e, 'leer'), 'push-jefatura');
    return { ok: false, codigo: 'SERVICE_WORKER' };
  }
  if (!suscripcion) return { ok: true, datos: [] };
  const r = await rpc<{ suscrita?: boolean; temas?: unknown }>('fn_suscripcion_push_admin', {
    endpoint: suscripcion.endpoint,
  });
  if (!r.ok) {
    anotarRpc('fn_suscripcion_push_admin', r.codigo);
    return r;
  }
  const temas = Array.isArray(r.datos?.temas) ? r.datos.temas.filter(esTema) : [];
  recordar(temas);
  return { ok: true, datos: temas };
}

/**
 * Sin temas: se borra en el servidor la fila de jefatura **del administrador que llama** en este
 * navegador (`fn_borrar_suscripcion_push_admin`, 0041 RV-225). La suscripción del navegador no se
 * da de baja: la pueden estar usando el voluntario u otro administrador en este mismo navegador, y
 * sin filas en el servidor no llega nada por ella (docs/32 RV-264).
 */
async function quitarTodos(registro: ServiceWorkerRegistration, antes: TemaJefatura[]): Promise<ResultadoTemas> {
  const suscripcion = await registro.pushManager.getSubscription();
  if (suscripcion) {
    const r = await rpc('fn_borrar_suscripcion_push_admin', { endpoint: suscripcion.endpoint });
    if (!r.ok) {
      anotarRpc('fn_borrar_suscripcion_push_admin', r.codigo);
      return { temas: antes, ok: false };
    }
  }
  recordar([]);
  return { temas: [], ok: true };
}

/** Los temas que han quedado activos y si se ha hecho lo pedido. */
export interface ResultadoTemas {
  temas: TemaJefatura[];
  ok: boolean;
}

/**
 * Deja los temas que se le pasan: con alguno, pide permiso y guarda la suscripción; sin ninguno,
 * borra la fila de este administrador. Nunca lanza ni se queda esperando (docs/31 RV-167): si algo
 * falla, devuelve `antes` (los temas que había) con `ok: false`, y lo que no depende de jefatura
 * queda anotado (TR-90). `limiteSwMs` solo se cambia en los tests.
 */
export async function fijarTemas(
  temas: TemaJefatura[],
  { antes = [] as TemaJefatura[], limiteSwMs = LIMITE_SW_MS } = {},
): Promise<ResultadoTemas> {
  if (!PUBLICA) return { temas: [], ok: false };
  let registro: ServiceWorkerRegistration;
  try {
    registro = await registroListo(limiteSwMs);
  } catch (e) {
    anotarError(errorSinDatos(e, 'serviceWorker.ready'), 'push-jefatura');
    return { temas: antes, ok: false };
  }
  try {
    if (!temas.length) return await quitarTodos(registro, antes);
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') return { temas: antes, ok: false };
    let suscripcion: PushSubscription;
    try {
      suscripcion =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveBinaria(PUBLICA) }));
    } catch (e) {
      anotarError(errorSinDatos(e, 'subscribe'), 'push-jefatura');
      return { temas: antes, ok: false };
    }
    const r = await rpc('fn_guardar_suscripcion_push_admin', { suscripcion: suscripcion.toJSON(), temas });
    if (!r.ok) {
      anotarRpc('fn_guardar_suscripcion_push_admin', r.codigo);
      return { temas: antes, ok: false };
    }
    recordar(temas);
    return { temas, ok: true };
  } catch (e) {
    // Lo imprevisto (un navegador con la API a medias) también se dice y queda anotado.
    anotarError(errorSinDatos(e, 'fijar'), 'push-jefatura');
    return { temas: antes, ok: false };
  }
}

/** Que el servidor envíe lo que tenga en cola (05 §9). El panel lo pide al abrirse. */
export async function pedirEnvioComoJefatura(): Promise<void> {
  const token = await jwt();
  if (!token) return;
  await fetch('/api/push', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
}
