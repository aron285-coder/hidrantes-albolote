// Filtros y orden en un botón (06 §5 «Panel: botón de filtros y su hoja», UI-19, DEC-214; `docs/38` RV-504).
// Un botón dice lo que está puesto y abre, por debajo de 768 px, la hoja inferior modal de siempre (`Hoja`) y,
// desde 768, una ventana no modal de 400 px debajo del botón. Cada opción se aplica al tocarla; «Quitar filtros»
// (solo con algo puesto) vuelve a lo de por defecto y deja el orden; «Listo» o ✕ cierran.

import { Check, ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Hoja } from '@/componentes/Hoja';
import { usePanelMovil } from '@/hooks/ancho';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

export interface Opcion<V extends string> {
  valor: V;
  /** Para el resumen y el nombre accesible: «Alta», «Malo», «Código». */
  nombre: string;
  /** Si lo hay, el chip enseña esto (la etiqueta de color) en vez de `nombre`. */
  adorno?: ReactNode;
  /** «Malo 3». */
  cuenta?: number;
}

export interface Grupo<V extends string> {
  /** «Estado», «Operación», «Acción»: también es el nombre del radiogroup. */
  titulo: string;
  opciones: Opcion<V>[];
  valor: V;
  alCambiar: (v: V) => void;
  /** 'lista' para las listas largas (las acciones del Registro): filas con un círculo de radio. */
  forma?: 'chips' | 'lista';
  /** «Tocar otra vez el elegido cambia ▲ / ▼.» */
  ayuda?: string;
}

/** Los grupos llevan cada uno su tipo de valor; dentro de `Filtros` solo se pasan de un lado a otro. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CualquierGrupo = Grupo<any>;

export function Filtros({
  titulo,
  resumen,
  activo,
  grupos,
  alQuitar,
  lleno = false,
}: {
  /** El título de la hoja o la ventana: «Filtrar la cola», «Filtrar y ordenar». */
  titulo: string;
  /** Lo que está puesto: «Pendientes · Alta». */
  resumen: string;
  /** Algún filtro distinto de lo de por defecto (el orden no cuenta). */
  activo: boolean;
  grupos: CualquierGrupo[];
  alQuitar?: () => void;
  /** En el móvil, el botón ocupa el ancho que quede. */
  lleno?: boolean;
}) {
  const movil = usePanelMovil();
  const [abierto, setAbierto] = useState(false);
  // La ventana se alinea con el borde del botón que quede dentro de la pantalla: se mide al abrir.
  const [aLaDerecha, setALaDerecha] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);

  // Si el ancho cruza 768 px con la hoja o la ventana abierta, se cierra: no se queda en el modo equivocado.
  const [modo, setModo] = useState(movil);
  if (modo !== movil) {
    setModo(movil);
    if (abierto) setAbierto(false);
  }

  const cerrar = (devolverFoco = true) => {
    setAbierto(false);
    if (devolverFoco) requestAnimationFrame(() => boton.current?.focus());
  };

  const contenido = (
    <Contenido
      titulo={titulo}
      grupos={grupos}
      quitar={activo && alQuitar ? alQuitar : undefined}
      alCerrar={() => cerrar()}
    />
  );

  return (
    <div className={cn('relative', lleno && 'min-w-0 flex-1')}>
      <button
        ref={boton}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={T.panel.filtrosDe(resumen)}
        onClick={() => {
          if (abierto) return cerrar(false);
          const b = boton.current?.getBoundingClientRect();
          setALaDerecha(!!b && b.left + 400 > window.innerWidth - 8);
          setAbierto(true);
        }}
        className={cn(
          'rounded-boton bg-papel text-texto flex min-h-11 items-center gap-2 px-3 py-1.5 text-left text-[14px]',
          activo ? 'border-2 border-[var(--anillo-seleccion)] font-bold' : 'border-texto border-[1.5px] font-semibold',
          lleno && 'w-full',
        )}
      >
        <SlidersHorizontal size={16} aria-hidden className="shrink-0" />
        {/* Si el resumen no cabe, parte en dos líneas: nunca «…» (UI-17). */}
        <span className="min-w-0 flex-1 break-words">{resumen}</span>
        <ChevronDown size={16} aria-hidden className="shrink-0" />
      </button>
      {abierto &&
        (movil ? (
          <Hoja titulo={titulo} alCerrar={() => cerrar()} tituloVisible={false}>
            {contenido}
          </Hoja>
        ) : (
          <Ventana boton={boton} titulo={titulo} alCerrar={cerrar} aLaDerecha={aLaDerecha}>
            {contenido}
          </Ventana>
        ))}
    </div>
  );
}

/**
 * Desde 768 px: ventana no modal debajo del botón, alineada con el borde del botón que quede dentro de la
 * pantalla. El foco entra al abrir; Esc cierra y devuelve el foco al botón; tocar fuera y salir con Tab la
 * cierran (como el menú ☰ de la cabecera).
 */
function Ventana({
  boton,
  titulo,
  alCerrar,
  aLaDerecha,
  children,
}: {
  boton: React.RefObject<HTMLButtonElement | null>;
  titulo: string;
  alCerrar: (devolverFoco?: boolean) => void;
  aLaDerecha: boolean;
  children: ReactNode;
}) {
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    caja.current?.focus({ preventScroll: true });
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!caja.current?.contains(t) && !boton.current?.contains(t)) alCerrar(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Solo cierra esto: no llega a otros Esc de la página (Editar al lado de la tabla, en el PC).
      e.preventDefault();
      e.stopPropagation();
      alCerrar(true);
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
    // Una vez al abrir: alCerrar cambia en cada pintado y no debe volver a meter el foco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={caja}
      role="dialog"
      aria-label={titulo}
      tabIndex={-1}
      onBlur={(e) => {
        const a = e.relatedTarget as Node | null;
        if (a && !caja.current?.contains(a) && !boton.current?.contains(a)) alCerrar(false);
      }}
      className={cn(
        'bg-papel border-linea rounded-tarjeta absolute top-full z-[500] mt-1 flex max-h-[min(70dvh,560px)] w-[400px] max-w-[calc(100vw-1rem)] flex-col border shadow-[0_6px_24px_rgba(14,27,48,.28)] outline-none',
        aLaDerecha ? 'right-0' : 'left-0',
      )}
    >
      <div className="flex min-h-0 flex-col p-4">{children}</div>
    </div>
  );
}

/** Lo de dentro, igual en la hoja y en la ventana: cabecera con ✕, los grupos (se desplazan) y el pie fijo. */
function Contenido({
  titulo,
  grupos,
  quitar,
  alCerrar,
}: {
  titulo: string;
  grupos: CualquierGrupo[];
  quitar?: () => void;
  alCerrar: () => void;
}) {
  const listo = useRef<HTMLButtonElement>(null);
  return (
    <div className="flex max-h-[70dvh] min-h-0 flex-col">
      <div className="flex items-center gap-2 pb-2">
        <h2 className="flex-1 text-[15px] font-bold">{titulo}</h2>
        <button
          type="button"
          aria-label={T.ficha.cerrar}
          onClick={alCerrar}
          className="hover:bg-fondo -mr-2 grid size-11 place-items-center rounded"
        >
          <X size={20} aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        {grupos.map((g) => (
          <GrupoFiltro key={g.titulo} grupo={g} />
        ))}
      </div>
      <div className="border-linea flex items-center gap-3 border-t pt-3">
        {quitar && (
          <button
            type="button"
            // «Quitar filtros» desaparece al quitarlos: el foco pasa a «Listo», no se pierde en <body>.
            onClick={() => {
              quitar();
              requestAnimationFrame(() => listo.current?.focus());
            }}
            className="min-h-11 px-1 text-[14px] underline"
          >
            {T.panelInventario.quitarFiltros}
          </button>
        )}
        <button
          ref={listo}
          type="button"
          onClick={alCerrar}
          className="bg-marino-950 rounded-boton ml-auto min-h-11 px-5 text-[14px] font-semibold text-white"
        >
          {T.panel.listo}
        </button>
      </div>
    </div>
  );
}

export function GrupoFiltro({ grupo }: { grupo: CualquierGrupo }) {
  const lista = grupo.forma === 'lista';
  const ayuda = useId();
  return (
    <div className="mt-2">
      <p className="text-texto-suave mb-1.5 text-[12px] font-bold tracking-wide uppercase">{grupo.titulo}</p>
      {grupo.ayuda && (
        <p id={ayuda} className="text-texto-suave mb-1.5 text-[12px]">
          {grupo.ayuda}
        </p>
      )}
      <div
        role="radiogroup"
        aria-label={grupo.titulo}
        aria-describedby={grupo.ayuda ? ayuda : undefined}
        className={cn(lista ? 'flex max-h-72 flex-col overflow-y-auto' : 'flex flex-wrap gap-2')}
      >
        {grupo.opciones.map((o: Opcion<string>) => {
          const elegida = o.valor === grupo.valor;
          const nombre = o.cuenta != null ? `${o.nombre} ${o.cuenta}` : o.nombre;
          return lista ? (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={elegida}
              onClick={() => grupo.alCambiar(o.valor)}
              className="hover:bg-fondo flex min-h-11 items-center gap-3 rounded px-1 text-left text-[14px]"
            >
              <span
                aria-hidden
                className={cn(
                  'grid size-5 shrink-0 place-items-center rounded-full border-2',
                  elegida ? 'border-marino-700' : 'border-linea',
                )}
              >
                {elegida && <span className="bg-marino-700 size-2.5 rounded-full" />}
              </span>
              <span className={cn(elegida && 'font-semibold')}>{o.nombre}</span>
            </button>
          ) : (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={elegida}
              aria-label={o.adorno || o.cuenta != null ? nombre : undefined}
              onClick={() => grupo.alCambiar(o.valor)}
              className={cn(
                'flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[14px]',
                elegida
                  ? 'border-marino-700 bg-tinte-azul text-tinte-azul-texto border-2 font-semibold'
                  : 'border-linea text-texto border',
              )}
            >
              {elegida && <Check size={14} aria-hidden className="shrink-0" />}
              {o.adorno ?? o.nombre}
              {o.cuenta != null && <span className="text-texto-suave">{o.cuenta}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
