// Service Worker y aviso de versión nueva (TR-24). La versión nueva se detecta al abrir y cada hora
// con la app abierta; el voluntario elige cuándo recargar para no perder lo que está escribiendo.

import { registerSW } from 'virtual:pwa-register';
import { colaActual, estaPersistida } from './cola';

let hayNueva = false;
let actualizar: ((recargar?: boolean) => Promise<void>) | undefined;
const oyentes = new Set<() => void>();
const alPedir = new Set<() => void>();

export const versionNueva = () => hayNueva;

export function suscribirVersion(o: () => void): () => void {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

/** Recarga ya, sin preguntar. Solo tras `queHacerAlRecargar` o una confirmación. */
export function recargar(): void {
  if (actualizar) void actualizar(true);
  else location.reload();
}

/** Envíos que solo están en memoria (IndexedDB falló, RV-02): se pierden al recargar (docs/32 RV-230). */
export const soloEnMemoria = (cola = colaActual()) => cola.filter((i) => !estaPersistida(i.clave_local)).length;

/**
 * Qué hacer al pedir la versión nueva, desde cualquier pantalla (docs/32 RV-230): con envíos solo en
 * memoria no se recarga, se avisa; con un formulario a medias se pregunta (docs/31 RV-157); si no,
 * se recarga.
 */
export function queHacerAlRecargar(enFormulario: boolean): 'memoria' | 'formulario' | 'recargar' {
  if (soloEnMemoria() > 0) return 'memoria';
  return enFormulario ? 'formulario' : 'recargar';
}

/**
 * «Recargar» por versión nueva desde donde sea (el aviso de arriba, Ajustes). Lo atiende el aviso de
 * versión, que es quien pregunta; si nadie lo atiende, solo se recarga si no se pierde nada.
 */
export function pedirRecarga(): void {
  if (alPedir.size) alPedir.forEach((o) => o());
  else if (queHacerAlRecargar(false) === 'recargar') recargar();
}

/**
 * Con un formulario abierto la versión nueva no se ofrece: se actualiza al volver al mapa (docs/33
 * RV-313). No en la pantalla de «enviado», que se perdería, ni en otra cualquiera.
 */
export const debeActualizarAlVolver = (veniaDeFormulario: boolean, ruta: string): boolean =>
  veniaDeFormulario && ruta === '/';

/** El aviso de versión se apunta aquí para preguntar antes de recargar. */
export function alPedirRecarga(o: () => void): () => void {
  alPedir.add(o);
  return () => alPedir.delete(o);
}

export function registrarServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  actualizar = registerSW({
    onNeedRefresh() {
      hayNueva = true;
      oyentes.forEach((o) => o());
    },
    onRegisteredSW(_url, registro) {
      if (registro) setInterval(() => void registro.update().catch(() => undefined), 3600_000);
    },
  });
}
