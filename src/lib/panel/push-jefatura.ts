// Avisos push para jefatura (FR-164): nuevas propuestas (agrupadas, como mucho una por hora) y
// resumen semanal de los lunes. Opcionales y apagados por defecto, como los del voluntario.

import { rpc } from '../api';
import { escribir, leer } from '../almacen';
import { jwt } from './consultas';

export type TemaJefatura = 'nuevas_propuestas' | 'resumen_semanal';
export type EstadoPushJefatura = 'no_disponible' | 'instalar_primero' | 'denegado' | 'listo';

const CLAVE = 'push_jefatura';
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

/**
 * Deja los temas que se le pasan: con alguno, pide permiso y guarda la suscripción; sin ninguno,
 * la borra. Devuelve los temas que han quedado activos.
 */
export async function fijarTemas(temas: TemaJefatura[]): Promise<TemaJefatura[]> {
  if (!PUBLICA) return [];
  const registro = await navigator.serviceWorker.ready;
  if (!temas.length) {
    await (await registro.pushManager.getSubscription())?.unsubscribe().catch(() => undefined);
    escribir(CLAVE, []);
    return [];
  }
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return temasActivos();
  const suscripcion =
    (await registro.pushManager.getSubscription()) ??
    (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveBinaria(PUBLICA) }));
  const r = await rpc('fn_guardar_suscripcion_push_admin', { suscripcion: suscripcion.toJSON(), temas });
  if (!r.ok) return temasActivos();
  escribir(CLAVE, temas);
  return temas;
}

/** Que el servidor envíe lo que tenga en cola (05 §9). El panel lo pide al abrirse. */
export async function pedirEnvioComoJefatura(): Promise<void> {
  const token = await jwt();
  if (!token) return;
  await fetch('/api/push', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
}
