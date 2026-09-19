// Service Worker y aviso de versión nueva (TR-24). La versión nueva se detecta al abrir y cada hora
// con la app abierta; el voluntario elige cuándo recargar para no perder lo que está escribiendo.

import { registerSW } from 'virtual:pwa-register';

let hayNueva = false;
let actualizar: ((recargar?: boolean) => Promise<void>) | undefined;
const oyentes = new Set<() => void>();

export const versionNueva = () => hayNueva;

export function suscribirVersion(o: () => void): () => void {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

export function recargar(): void {
  if (actualizar) void actualizar(true);
  else location.reload();
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
