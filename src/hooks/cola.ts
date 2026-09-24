import { useSyncExternalStore } from 'react';
import { colaActual, suscribirCola } from '@/lib/cola';
import { misPropuestas, novedadesPendientes, suscribirMisPropuestas } from '@/lib/mis-propuestas';

export const useCola = () => useSyncExternalStore(suscribirCola, colaActual);
export const useMisPropuestas = () => useSyncExternalStore(suscribirMisPropuestas, misPropuestas);
export const useNovedades = () => useSyncExternalStore(suscribirMisPropuestas, novedadesPendientes);
