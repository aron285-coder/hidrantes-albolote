import { useCallback, useEffect, useRef, useState } from 'react';
import type { Resultado } from '@/lib/api';
import { registrarComprobacion } from '@/lib/conexion';
import { anotarError } from '@/lib/errores';

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
 * El resultado de la carga que se está viendo, no el de la propia (docs/33 RV-334, N4): si otra más
 * nueva la ha sustituido (la recarga de cada minuto), se espera a esa, y así hasta la última. Sin esto,
 * una carga vieja que llega bien desbloqueaba "Confirmar y aprobar" con datos que no se ven.
 */
export async function esperarLaUltima(
  propia: Promise<boolean>,
  ultima: () => Promise<boolean> | null,
): Promise<boolean> {
  let p = propia;
  for (;;) {
    const ok = await p;
    const u = ultima();
    if (!u || u === p) return ok;
    p = u;
  }
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
): Carga<T> & { en: number | null; recargar: () => Promise<void>; recargarYVer: () => Promise<boolean> } {
  const [carga, setCarga] = useState<Carga<T>>({ estado: 'cargando', datos: null });
  const [en, setEn] = useState<number | null>(null);
  const ultimo = useRef(0);
  // La carga más nueva en curso o terminada: la que se ve (RV-334).
  const enCurso = useRef<Promise<boolean> | null>(null);

  // Las dependencias las da quien llama, como en useEffect.
  const cargarRef = useCallback(cargar, deps);

  // Devuelve si la carga ha ido bien y es la que se ve: una que llega tarde devuelve false.
  const cargarUna = useCallback(async (): Promise<boolean> => {
    const n = ++ultimo.current;
    let r: Resultado<T>;
    try {
      r = await cargarRef();
    } catch (e) {
      // Una fila que no se sabe leer no deja la pantalla en "Cargando…" para siempre.
      anotarError(e);
      r = { ok: false, codigo: 'ERROR_INTERNO' };
    }
    if (n !== ultimo.current) return false; // llegó tarde: lo que se ve es de una carga más nueva
    if (r.ok) {
      setCarga({ estado: 'ok', datos: r.datos });
      setEn(Date.now());
    } else {
      const codigo = r.codigo;
      setCarga((c) => ({ estado: 'error', datos: c.datos, codigo }));
    }
    return r.ok;
  }, [cargarRef]);
  const recargar = useCallback((): Promise<boolean> => {
    const p = cargarUna();
    enCurso.current = p;
    return p;
  }, [cargarUna]);

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

  // `recargar` sigue sin devolver nada para quien ya la usa; `recargarYVer` dice si lo que se ve es
  // de una carga buena, esperando a la última si otra más nueva sustituye a la suya (RV-334).
  const recargarSinMas = useCallback(async () => {
    await recargar();
  }, [recargar]);
  const recargarYVer = useCallback(() => esperarLaUltima(recargar(), () => enCurso.current), [recargar]);
  return { ...carga, en, recargar: recargarSinMas, recargarYVer };
}
