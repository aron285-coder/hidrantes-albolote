import { useSyncExternalStore } from 'react';
import { suscribirVersion, versionNueva } from '@/lib/pwa';

export const useVersionNueva = () => useSyncExternalStore(suscribirVersion, versionNueva);
