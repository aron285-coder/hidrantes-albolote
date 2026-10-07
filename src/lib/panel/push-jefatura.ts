// Avisos push para jefatura (FR-164): nuevas propuestas (agrupadas, como mucho una por hora) y
// resumen semanal de los lunes. Opcionales y apagados por defecto, como los del voluntario.

import { SIN_SERVIDOR, rpc } from '../api';
import { escribir, leer } from '../almacen';
import { anotarError } from '../errores';

import { jwt } from './consultas';

export type TemaJefatura = 'nuevas_propuestas' | 'resumen_semanal';
export type EstadoPushJefatura = 'no_disponible' | 'instalar_primero' | 'denegado' | 'listo';

const CLAVE = 'push_jefatura';
/** La que marca `activarPush` del voluntario (lib/push.ts) cuando tiene los avisos activos aquí. */
const CLAVE_VOLUNTARIO = 'push';
const PUBLICA = import.meta.env.VITE_VAPID_PUBLIC_KEY;

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

/** Temas activos en este navegador. El servidor guarda la suscripción; aquí solo se recuerda qué se pidió. */
export const temasActivos = (): TemaJefatura[] => leer<TemaJefatura[]>(CLAVE) ?? [];

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

/**
 * Sin temas: se borra en el servidor **solo** la suscripción de jefatura de este navegador
 * (`fn_borrar_suscripcion_push_admin`, 0040). La del navegador se comparte con la del voluntario
 * (0030): solo se da de baja si el voluntario no tiene los avisos activos aquí (docs/31 RV-167).
 */
async function quitarTodos(registro: ServiceWorkerRegistration): Promise<ResultadoTemas> {
  const suscripcion = await registro.pushManager.getSubscription();
  if (suscripcion) {
    const r = await rpc('fn_borrar_suscripcion_push_admin', { endpoint: suscripcion.endpoint });
    if (!r.ok) {
      if (r.codigo !== SIN_SERVIDOR) {
        anotarError(new Error(`fn_borrar_suscripcion_push_admin: ${r.codigo}`.slice(0, 500)), 'push-jefatura');
      }
      return { temas: temasActivos(), ok: false };
    }
    if (!leer<boolean>(CLAVE_VOLUNTARIO)) {
      // Borrada ya en el servidor, no llegará nada aunque esto falle: se anota y basta.
      await suscripcion
        .unsubscribe()
        .catch((e: unknown) => anotarError(errorSinDatos(e, 'unsubscribe'), 'push-jefatura'));
    }
  }
  escribir(CLAVE, []);
  return { temas: [], ok: true };
}

/** Los temas que han quedado activos y si se ha hecho lo pedido. */
export interface ResultadoTemas {
  temas: TemaJefatura[];
  ok: boolean;
}

/**
 * Deja los temas que se le pasan: con alguno, pide permiso y guarda la suscripción; sin ninguno,
 * la borra. Nunca lanza ni se queda esperando (docs/31 RV-167): si algo falla, devuelve los temas
 * que siguen activos con `ok: false`, y lo que no depende de jefatura queda anotado (TR-90).
 * `limiteSwMs` solo se cambia en los tests.
 */
export async function fijarTemas(temas: TemaJefatura[], { limiteSwMs = LIMITE_SW_MS } = {}): Promise<ResultadoTemas> {
  if (!PUBLICA) return { temas: [], ok: false };
  let registro: ServiceWorkerRegistration;
  try {
    registro = await registroListo(limiteSwMs);
  } catch (e) {
    anotarError(errorSinDatos(e, 'serviceWorker.ready'), 'push-jefatura');
    return { temas: temasActivos(), ok: false };
  }
  try {
    if (!temas.length) return await quitarTodos(registro);
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') return { temas: temasActivos(), ok: false };
    let suscripcion: PushSubscription;
    try {
      suscripcion =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveBinaria(PUBLICA) }));
    } catch (e) {
      anotarError(errorSinDatos(e, 'subscribe'), 'push-jefatura');
      return { temas: temasActivos(), ok: false };
    }
    const r = await rpc('fn_guardar_suscripcion_push_admin', { suscripcion: suscripcion.toJSON(), temas });
    if (!r.ok) {
      // Sin cobertura no es un fallo de la aplicación: se dice, pero no se anota.
      if (r.codigo !== SIN_SERVIDOR) {
        anotarError(new Error(`fn_guardar_suscripcion_push_admin: ${r.codigo}`.slice(0, 500)), 'push-jefatura');
      }
      return { temas: temasActivos(), ok: false };
    }
    escribir(CLAVE, temas);
    return { temas, ok: true };
  } catch (e) {
    // Lo imprevisto (un navegador con la API a medias) también se dice y queda anotado.
    anotarError(errorSinDatos(e, 'fijar'), 'push-jefatura');
    return { temas: temasActivos(), ok: false };
  }
}

/** Que el servidor envíe lo que tenga en cola (05 §9). El panel lo pide al abrirse. */
export async function pedirEnvioComoJefatura(): Promise<void> {
  const token = await jwt();
  if (!token) return;
  await fetch('/api/push', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
}
