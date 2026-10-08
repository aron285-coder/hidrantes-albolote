// docs/32 RV-238: los avisos de arriba (versión nueva, notificación con un formulario a medias y
// novedades de lo propuesto) iban cada uno con su `fixed` en el mismo sitio y el mismo z-index, y se
// tapaban entre sí y tapaban el buscador del mapa. Ahora van todos en un contenedor común que los
// apila (versión arriba, novedades debajo) y publica su alto en `--alto-avisos`: el mapa baja su
// margen superior mientras hay avisos.
//
// El contenedor va dentro de la barra superior (pegado debajo de ella y de la banda de conexión), y
// no a una altura fija: con la banda de pruebas de staging o la de sin conexión, la barra es más alta
// y una altura fija la tapaba.

import { type ReactNode, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/** Separación entre la barra y la pila, entre avisos (gap-2) y bajo la pila, en px. */
const SEPARACION = 8;

/**
 * Las pilas montadas, en orden de montaje: manda la última. Con la ficha a pantalla completa del móvil
 * hay dos barras a la vez (la del armazón debajo y la de la ficha encima); al cerrarla vuelve la otra.
 */
const pilas: HTMLElement[] = [];
/** La pila de reserva, fija arriba, para las pantallas sin barra superior (el panel, la bienvenida). */
let reserva: HTMLElement | null = null;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((o) => o());
function suscribir(o: () => void) {
  oyentes.add(o);
  return () => oyentes.delete(o);
}
const pilaActual = () => pilas.at(-1) ?? reserva;

/**
 * El contenedor de los avisos, bajo la barra superior (BarraSuperior lo monta). Con `reserva`, el
 * de las pantallas sin barra (App.tsx lo monta una vez): fijo arriba, y solo se usa si no hay otro.
 */
export function PilaAvisos({ reserva: esReserva = false }: { reserva?: boolean }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const ref = useCallback((n: HTMLDivElement | null) => setEl(n), []);
  useEffect(() => {
    if (!el) return;
    if (esReserva) {
      reserva = el;
      avisar();
      return () => {
        reserva = null;
        avisar();
      };
    }
    pilas.push(el);
    avisar();
    const raiz = document.documentElement;
    const medir = () => {
      if (pilaActual() !== el) return;
      const alto = el.getBoundingClientRect().height;
      raiz.style.setProperty('--alto-avisos', alto > 0 ? `${Math.ceil(alto) + 2 * SEPARACION}px` : '0px');
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => {
      observador.disconnect();
      pilas.splice(pilas.indexOf(el), 1);
      if (!pilas.length) raiz.style.removeProperty('--alto-avisos');
      avisar();
    };
  }, [el, esReserva]);
  return (
    <div
      ref={ref}
      data-testid="pila-avisos"
      // Sin eventos en el hueco entre avisos: solo los avisos se tocan, lo de debajo sigue a mano.
      className={cn(
        'pointer-events-none mx-auto flex max-w-md flex-col gap-2 *:pointer-events-auto',
        esReserva
          ? 'fixed inset-x-3 top-[calc(env(safe-area-inset-top)+3.5rem)] z-30'
          : 'absolute inset-x-3 top-full mt-2',
      )}
    />
  );
}

/** Pone `children` en la pila, en su sitio según `orden` (ORDEN_AVISO de src/lib/orden-avisos.ts). Sin pila montada, nada. */
export function EnPilaAvisos({ orden, children }: { orden: number; children: ReactNode }) {
  const el = useSyncExternalStore(suscribir, pilaActual, () => null);
  if (!el) return null;
  return createPortal(<div style={{ order: orden }}>{children}</div>, el);
}
