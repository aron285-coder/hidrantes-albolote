// Enganches de React a los estados globales de src/lib (acceso, conexión, puntos, posición…).

import { useSyncExternalStore } from 'react';
import { acceso, suscribirAcceso } from '@/lib/acceso';
import { estadoConexion, suscribir } from '@/lib/conexion';
import { avisoInstalarCerrado, estadoInstalar, suscribirInstalar } from '@/lib/instalar';
import { estadoMapabase, suscribirMapabase } from '@/lib/mapabase';
import { estadoPosicion, suscribirPosicion } from '@/lib/posicion';
import { estadoPuntos, suscribirPuntos } from '@/lib/puntos';
import { modoEfectivo, suscribirTema } from '@/lib/tema';

export const useAcceso = () => useSyncExternalStore(suscribirAcceso, acceso);
export const useConexion = () => useSyncExternalStore(suscribir, estadoConexion);
export const usePuntos = () => useSyncExternalStore(suscribirPuntos, estadoPuntos);
export const usePosicion = () => useSyncExternalStore(suscribirPosicion, estadoPosicion);
export const useMapabase = () => useSyncExternalStore(suscribirMapabase, estadoMapabase);
export const useModo = () => useSyncExternalStore(suscribirTema, modoEfectivo);
export const useInstalar = () => useSyncExternalStore(suscribirInstalar, estadoInstalar);
export const useAvisoInstalarCerrado = () => useSyncExternalStore(suscribirInstalar, avisoInstalarCerrado);
