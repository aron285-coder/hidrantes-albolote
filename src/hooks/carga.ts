import { useCallback, useEffect, useRef, useState } from 'react';
import type { Resultado } from '@/lib/api';
import { registrarComprobacion } from '@/lib/conexion';

export type Carga<T> =
  | { estado: 'cargando'; datos: T | null }
  | { estado: 'ok'; datos: T }
  | { estado: 'error'; datos: T | null; codigo: string };

/**
 * Cómo queda la carga al montar o al cambiar la entrada (las dependencias): "cargando" y, con `vaciar`,
 * sin las filas de la entrada anterior. Sin `vaciar`, conserva lo que había (FR-168: nunca en blanco).
 */
export function alCambiarEntrada<T>(c: Carga<T>, vaciar: boolean): Carga<T> {
  return { estado: 'cargando', datos: vaciar ? null : c.datos };
}

/**
 * Carga datos del servidor para una pestaña del panel. Si falla, conserva lo que ya había (FR-168:
 * nunca en blanco) y dice el código; `recargar` repite, y también el reintento automático de la
 * degradación controlada. `cadaMs` refresca solo (FR-110). `en`: última carga buena.
 *
 * `vaciarAlCambiar`: al cambiar la entrada, la lista se vacía mientras llega la nueva, en vez de
 * enseñar la de antes como si fuera de la nueva (en la Cola, pendientes como aprobadas; docs/32 RV-250).
 */
export function useCarga<T>(
  cargar: () => Promise<Resultado<T>>,
  deps: readonly unknown[],
  cadaMs?: number,
  { vaciarAlCambiar = false }: { vaciarAlCambiar?: boolean } = {},
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
    setCarga((c) => alCambiarEntrada(c, vaciarAlCambiar));
    void recargar();
    return registrarComprobacion(recargar);
    // vaciarAlCambiar es fijo en cada llamada: no es una entrada.
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
