// Botón de menú del panel (06 §5, `docs/38` RV-502): el patrón de «Exportar ▾» (`docs/29` RV-123) sacado a una
// pieza, para «Exportar» y para el «⋯» de cada fila. Patrón de botón de menú de WAI-ARIA: flechas, Inicio y Fin
// dentro del menú; ↓ o ↑ en el botón lo abren en la primera o la última opción; Esc lo cierra y devuelve el foco
// al botón; tocar fuera o Tab lo cierran sin quitar el foco de donde vaya.
//
// El menú se pinta en un portal con posición fija junto al botón (las listas van dentro de un contenedor con
// `overflow-auto`, que lo cortaría) y se abre hacia arriba si no cabe debajo. Si la página se desplaza o cambia
// de tamaño, se cierra: no se queda flotando lejos de su botón.

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface OpcionMenu {
  nombre: string;
  alElegir: () => void;
  /** Destructiva (UI-14): va la última, en rojo y con una línea encima. */
  peligro?: boolean;
  deshabilitada?: boolean;
  /** Por qué está deshabilitada (UI-02): se escribe dentro del menú y la opción lo lleva en `aria-describedby`. */
  motivo?: string;
  /** El id de un motivo escrito fuera del menú (el de «Exportar», debajo de su botón). */
  descritaPor?: string;
}

interface Posicion {
  top: number;
  left: number;
}

/** Margen con el borde de la pantalla y separación con el botón. */
const MARGEN = 8;
const SEPARACION = 4;

export function MenuBoton({
  nombre,
  opciones,
  className,
  children,
  ocupado = false,
  describedBy,
  ref,
}: {
  /** Nombre accesible, si el contenido no lo da (un icono). */
  nombre?: string;
  opciones: OpcionMenu[];
  className: string;
  children: ReactNode;
  /** Mientras trabaja («Exportando…»): no abre, pero no se deshabilita, para no perder el foco. */
  ocupado?: boolean;
  describedBy?: string;
  ref?: Ref<HTMLButtonElement>;
}) {
  const [abierto, setAbierto] = useState<false | 'primero' | 'ultimo'>(false);
  const [posicion, setPosicion] = useState<Posicion | null>(null);
  const boton = useRef<HTMLButtonElement | null>(null);
  const capa = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  // Las destructivas, al final (UI-14).
  const ordenadas = [...opciones.filter((o) => !o.peligro), ...opciones.filter((o) => o.peligro)];
  // Cada motivo, una vez (UI-16), aunque lo compartan varias opciones.
  const motivos = [...new Set(ordenadas.flatMap((o) => (o.motivo ? [o.motivo] : [])))];

  const habilitadas = () => [
    ...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []),
  ];
  const cerrar = (devolverFoco: boolean) => {
    setAbierto(false);
    setPosicion(null);
    if (devolverFoco) boton.current?.focus();
  };

  // Junto al botón, alineado con su borde derecho; arriba si no cabe debajo; siempre dentro de la pantalla.
  useLayoutEffect(() => {
    if (!abierto || !boton.current || !capa.current) return;
    const b = boton.current.getBoundingClientRect();
    const m = capa.current.getBoundingClientRect();
    const abajo = b.bottom + SEPARACION;
    const top =
      abajo + m.height > window.innerHeight - MARGEN && b.top - SEPARACION - m.height >= MARGEN
        ? b.top - SEPARACION - m.height
        : abajo;
    const left = Math.min(Math.max(MARGEN, b.right - m.width), window.innerWidth - MARGEN - m.width);
    setPosicion({ top, left });
  }, [abierto]);

  useEffect(() => {
    if (!abierto || !posicion) return;
    const lista = habilitadas();
    (abierto === 'ultimo' ? lista.at(-1) : lista[0])?.focus();
  }, [abierto, posicion]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!capa.current?.contains(t) && !boton.current?.contains(t)) cerrar(false);
    };
    const moverse = (e: Event) => {
      if (!capa.current?.contains(e.target as Node)) cerrar(false);
    };
    const redimensionar = () => cerrar(false);
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('scroll', moverse, true);
    window.addEventListener('resize', redimensionar);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('scroll', moverse, true);
      window.removeEventListener('resize', redimensionar);
    };
  }, [abierto]);

  function teclaMenu(e: ReactKeyboardEvent) {
    const lista = habilitadas();
    const i = lista.indexOf(document.activeElement as HTMLButtonElement);
    const ir = (n: number) => lista[(n + lista.length) % lista.length]?.focus();
    if (e.key === 'ArrowDown') ir(i + 1);
    else if (e.key === 'ArrowUp') ir(i - 1);
    else if (e.key === 'Home') ir(0);
    else if (e.key === 'End') ir(lista.length - 1);
    else if (e.key === 'Escape') cerrar(true);
    else if (e.key === 'Tab') {
      // Tab sale del menú: el foco vuelve al botón y sigue desde ahí, como si el menú no estuviera.
      cerrar(false);
      boton.current?.focus();
      return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
  }

  const asignar = (el: HTMLButtonElement | null) => {
    boton.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  return (
    <>
      <button
        ref={asignar}
        type="button"
        id={`${id}-boton`}
        aria-label={nombre}
        aria-haspopup="menu"
        aria-expanded={!!abierto}
        aria-controls={abierto ? `${id}-menu` : undefined}
        aria-disabled={ocupado || undefined}
        aria-busy={ocupado || undefined}
        aria-describedby={describedBy}
        onClick={() => {
          if (ocupado) return;
          if (abierto) cerrar(false);
          else setAbierto('primero');
        }}
        onKeyDown={(e) => {
          if (ocupado) return;
          // Con el menú abierto y el foco aún en el botón (todas las opciones deshabilitadas), Esc y Tab lo cierran.
          if (abierto && e.key === 'Escape') {
            e.preventDefault();
            return cerrar(false);
          }
          if (abierto && e.key === 'Tab') return cerrar(false);
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          e.preventDefault();
          setAbierto(e.key === 'ArrowUp' ? 'ultimo' : 'primero');
        }}
        className={className}
      >
        {children}
      </button>
      {abierto &&
        createPortal(
          <div ref={capa} className="fixed z-[1000]" style={posicion ?? { top: 0, left: 0, visibility: 'hidden' }}>
            <div
              ref={menu}
              id={`${id}-menu`}
              role="menu"
              aria-labelledby={`${id}-boton`}
              onKeyDown={teclaMenu}
              className="bg-papel border-linea rounded-tarjeta flex min-w-44 flex-col border py-1 shadow-[0_6px_24px_rgba(14,27,48,.28)]"
            >
              {ordenadas.map((o) => (
                <button
                  key={o.nombre}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  disabled={o.deshabilitada}
                  aria-describedby={o.motivo ? `${id}-motivo-${motivos.indexOf(o.motivo)}` : o.descritaPor}
                  onClick={() => {
                    cerrar(true);
                    o.alElegir();
                  }}
                  className={cn(
                    'hover:bg-fondo focus:bg-fondo disabled:text-texto-suave min-h-11 px-4 text-left text-[14px] disabled:cursor-not-allowed disabled:hover:bg-transparent',
                    o.peligro && 'text-rojo-texto border-linea mt-1 border-t font-semibold',
                  )}
                >
                  {o.nombre}
                </button>
              ))}
            </div>
            {motivos.length > 0 && (
              <div className="bg-papel border-linea rounded-tarjeta -mt-1 border border-t-0 px-4 pb-2">
                {motivos.map((m, i) => (
                  <p key={m} id={`${id}-motivo-${i}`} className="text-texto-suave text-[12px]">
                    {m}
                  </p>
                ))}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
