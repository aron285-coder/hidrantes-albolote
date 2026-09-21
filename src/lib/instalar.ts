// Instalar la app desde la propia app (FR-04, notas para 14). El menú del navegador cambia de nombre
// según el idioma y la versión ("Instalar aplicación", "Añadir a pantalla de inicio", "App
// installeren"…); con el evento beforeinstallprompt la app ofrece su propio botón. En iPhone no hay
// evento: se explica el camino de Safari.

import { escribir, leer } from './almacen';

interface EventoInstalar extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type EstadoInstalar = 'instalada' | 'disponible' | 'ios' | 'menu';

let evento: EventoInstalar | null = null;
let instalada = false;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((o) => o());

const enModoApp = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function estadoInstalar(): EstadoInstalar {
  if (instalada || enModoApp()) return 'instalada';
  if (evento) return 'disponible';
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return 'ios';
  return 'menu';
}

export function suscribirInstalar(o: () => void): () => void {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

/** Muestra el diálogo de instalación del navegador. */
export async function instalar(): Promise<void> {
  if (!evento) return;
  const e = evento;
  evento = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === 'accepted') instalada = true;
  avisar();
}

/** El aviso del mapa se cierra una vez y no vuelve (sigue en Ajustes). */
export const avisoInstalarCerrado = () => leer<boolean>('aviso_instalar_cerrado') === true;
export function cerrarAvisoInstalar() {
  escribir('aviso_instalar_cerrado', true);
  avisar();
}

/** Se engancha al arrancar: el navegador lanza el evento una sola vez y muy pronto. */
export function escucharInstalacion(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    evento = e as EventoInstalar;
    avisar();
  });
  window.addEventListener('appinstalled', () => {
    instalada = true;
    evento = null;
    avisar();
  });
}
