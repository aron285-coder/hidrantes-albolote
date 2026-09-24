// Contexto del panel: búsqueda global y avisos. El proveedor está en contexto.tsx.

import { createContext, useContext } from 'react';

export type TipoAviso = 'ok' | 'error';

export interface Panel {
  /** Búsqueda global de la cabecera (FR-145): la aplican la cola, el inventario y el registro. */
  busqueda: string;
  buscar: (texto: string) => void;
  /** Aviso breve tras cada acción (UI-05) o fallo visible (UI-04). */
  avisar: (texto: string, tipo?: TipoAviso) => void;
}

export const Contexto = createContext<Panel | null>(null);

export function usePanel(): Panel {
  const c = useContext(Contexto);
  if (!c) throw new Error('usePanel fuera del panel');
  return c;
}
