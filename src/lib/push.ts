// Avisos push del voluntario (FR-163): opcionales y apagados por defecto. Se explica antes de pedir
// permiso; en iPhone solo funcionan con la app instalada. Suscripción con fn_guardar_suscripcion_push;
// el envío lo hace /api/push, al que el móvil llama tras cada sincronización.

import { rpc } from './api';
import { escribir, leer } from './almacen';
import { leerSesion } from './sesion';

const CLAVE = 'push';
const PUBLICA = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export type EstadoPush = 'no_disponible' | 'instalar_primero' | 'denegado' | 'activo' | 'inactivo';

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

/** Pide permiso, se suscribe y lo guarda en el servidor. Devuelve el estado final. */
export async function activarPush(): Promise<EstadoPush> {
  const sesion = leerSesion();
  if (!sesion || !PUBLICA) return 'no_disponible';
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return permiso === 'denied' ? 'denegado' : 'inactivo';
  const registro = await navigator.serviceWorker.ready;
  const suscripcion =
    (await registro.pushManager.getSubscription()) ??
    (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveBinaria(PUBLICA) }));
  const r = await rpc('fn_guardar_suscripcion_push', {
    token: sesion.token,
    suscripcion: suscripcion.toJSON(),
    temas: ['resultado_propuesta'],
  });
  if (!r.ok) return 'inactivo';
  escribir(CLAVE, true);
  return 'activo';
}

export async function desactivarPush(): Promise<EstadoPush> {
  escribir(CLAVE, false);
  try {
    const registro = await navigator.serviceWorker.ready;
    await (await registro.pushManager.getSubscription())?.unsubscribe();
  } catch {
    // sin suscripción local
  }
  const sesion = leerSesion();
  if (sesion) await rpc('fn_borrar_suscripcion_push', { token: sesion.token });
  return estadoPush();
}

/** Tras sincronizar: que el servidor envíe los avisos pendientes de todos (05 §9). Sin esperar. */
export function pedirEnvioPush(token: string): void {
  void fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  }).catch(() => undefined);
}
