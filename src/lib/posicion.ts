// Posición del móvil (FR-65): para centrar el mapa, el halo de precisión y las distancias de la
// lista y la ficha. Solo en memoria: nunca se envía ni se guarda (11 §2; la de las propuestas llega
// en la Fase 6 con su formulario).

export interface Posicion {
  lat: number;
  lng: number;
  /** Radio de precisión en metros. */
  precision: number;
}

export type EstadoPosicion =
  | { tipo: 'inactiva' }
  | { tipo: 'buscando' }
  | { tipo: 'ok'; posicion: Posicion }
  | { tipo: 'denegada' }
  | { tipo: 'no_disponible' };

let estado: EstadoPosicion = { tipo: 'inactiva' };
let vigilancia: number | null = null;
const oyentes = new Set<() => void>();

function fijar(e: EstadoPosicion) {
  estado = e;
  oyentes.forEach((o) => o());
}

export const estadoPosicion = () => estado;
export const posicionActual = (): Posicion | null => (estado.tipo === 'ok' ? estado.posicion : null);

export function suscribirPosicion(o: () => void): () => void {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

/** Empieza a seguir la posición. Pide permiso la primera vez. */
export function activarPosicion(): void {
  if (vigilancia !== null) return;
  if (!('geolocation' in navigator)) return fijar({ tipo: 'no_disponible' });
  if (estado.tipo !== 'ok') fijar({ tipo: 'buscando' });
  vigilancia = navigator.geolocation.watchPosition(
    (p) =>
      fijar({
        tipo: 'ok',
        posicion: { lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy },
      }),
    (e) => {
      if (vigilancia !== null) navigator.geolocation.clearWatch(vigilancia);
      vigilancia = null;
      fijar({ tipo: e.code === e.PERMISSION_DENIED ? 'denegada' : 'no_disponible' });
    },
    { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
  );
}

/** Si el permiso ya estaba concedido, se sigue la posición desde el arranque sin preguntar. */
export async function activarSiHayPermiso(): Promise<void> {
  try {
    const p = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    if (p?.state === 'granted') activarPosicion();
  } catch {
    // Safari antiguo sin Permissions API: se espera al botón
  }
}
