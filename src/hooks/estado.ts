// Enganches de React a los estados globales de src/lib (acceso, conexión, versión nueva).

import { useSyncExternalStore } from 'react';
import { acceso, suscribirAcceso } from '@/lib/acceso';
import { estadoConexion, suscribir } from '@/lib/conexion';

export const useAcceso = () => useSyncExternalStore(suscribirAcceso, acceso);
export const useConexion = () => useSyncExternalStore(suscribir, estadoConexion);
