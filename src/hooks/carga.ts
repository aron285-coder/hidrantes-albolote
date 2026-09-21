import { useCallback, useEffect, useRef, useState } from 'react';
import type { Resultado } from '@/lib/api';
import { registrarComprobacion } from '@/lib/conexion';

export type Carga<T> =
  | { estado: 'cargando'; datos: T | null }
  | { estado: 'ok'; datos: T }
  | { estado: 'error'; datos: T | null; codigo: string };

/**
 * Carga datos del servidor para una pestaña del panel. Si falla, conserva lo que ya había (FR-168:
 * nunca en blanco) y dice el código; `recargar` repite, y también el reintento automático de la
 * degradación controlada. `cadaMs` refresca solo (FR-110). `en`: última carga buena.
 */
export function useCarga<T>(
  cargar: () => Promise<Resultado<T>>,
  deps: readonly unknown[],
  cadaMs?: number,
): Carga<T> & { en: number | null; recargar: () => Promise<void> } {
  const [carga, setCarga] = useState<Carga<T>>({ estado: 'cargando', datos: null });
  const [en, setEn] = useState<number | null>(null);
  const ultimo = useRef(0);

  // Las dependencias las da quien llama, como en useEffect.
  const cargarRef = useCallback(cargar, deps);

  const recargar = useCallback(async () => {
    const n = ++ultimo.current;
    const r = await cargarRef();
    if (n !== ultimo.current) return; // llegó tarde: ya hay una carga más nueva
    if (r.ok) {
      setCarga({ estado: 'ok', datos: r.datos });
      setEn(Date.now());
    } else {
      setCarga((c) => ({ estado: 'error', datos: c.datos, codigo: r.codigo }));
    }
  }, [cargarRef]);

  useEffect(() => {
    setCarga((c) => ({ estado: 'cargando', datos: c.datos }));
    void recargar();
    return registrarComprobacion(recargar);
  }, [recargar]);

  useEffect(() => {
    if (!cadaMs) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void recargar();
    }, cadaMs);
    return () => clearInterval(t);
  }, [cadaMs, recargar]);

  return { ...carga, en, recargar };
}
