// docs/32 RV-238: los avisos de arriba (versión nueva, notificación con un formulario a medias y
// novedades de lo propuesto) iban cada uno con su `fixed` en el mismo sitio y el mismo z-index, y se
// tapaban entre sí y tapaban el buscador del mapa. Ahora van todos en un contenedor común que los
// apila (versión arriba, novedades debajo).
//
// El contenedor va dentro de la barra superior, en el flujo de la página, justo debajo de la barra y
// de la banda de conexión: mientras hay avisos ocupa su sitio y lo de debajo (el mapa con su buscador,
// la lista, el formulario) baja lo que ocupan, en vez de quedar tapado. Sin avisos no ocupa nada.

import { type ReactNode, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

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
 * de las pantallas sin barra (App.tsx lo monta una vez): fijo arriba, como antes, y solo se usa si no
 * hay otro.
 */
export function PilaAvisos({ reserva: esReserva = false }: { reserva?: boolean }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const ref = useCallback((n: HTMLDivElement | null) => setEl(n), []);
  useEffect(() => {
    if (!el) return;
    if (esReserva) reserva = el;
    else pilas.push(el);
    avisar();
    return () => {
      if (esReserva) reserva = null;
      else pilas.splice(pilas.indexOf(el), 1);
      avisar();
    };
  }, [el, esReserva]);
  if (esReserva) {
    return (
      <div
        ref={ref}
        data-testid="pila-avisos"
        // Sin eventos en el hueco entre avisos: solo los avisos se tocan.
        className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+3.5rem)] z-30 mx-auto flex max-w-md flex-col gap-2 *:pointer-events-auto"
      />
    );
  }
  return (
    // Con algún aviso dentro ocupa su sitio, con el fondo de la página (al hacer scroll, lo de debajo
    // no se ve entre los avisos); vacía no ocupa nada.
    <div className="bg-fondo px-3 py-2 has-[>div:empty]:hidden">
      <div ref={ref} data-testid="pila-avisos" className="mx-auto flex max-w-md flex-col gap-2" />
    </div>
  );
}

/**
 * Pone `children` en la pila, en su sitio según `orden` (ORDEN_AVISO de src/lib/orden-avisos.ts). Si
 * no hubiera ninguna pila montada, el aviso se pinta donde está: nunca se pierde sin decir nada.
 */
export function EnPilaAvisos({ orden, children }: { orden: number; children: ReactNode }) {
  const el = useSyncExternalStore(suscribir, pilaActual, () => null);
  if (!el) return <div style={{ order: orden }}>{children}</div>;
  return createPortal(<div style={{ order: orden }}>{children}</div>, el);
}
