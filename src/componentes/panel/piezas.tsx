// Piezas pequeñas del panel que se repiten entre pestañas (06 §5).

import type { ReactNode, Ref } from 'react';
import { Ellipsis } from 'lucide-react';
import { Boton } from '@/componentes/Boton';
import { claseChip, nombreCaudal } from '@/lib/ficha';
import { cuando, fechaCorta, fechaDe, horaCorta } from '@/lib/formato';
import { ETIQUETA_OPERACION } from '@/lib/nombres-operacion';
import { textoError } from '@/lib/panel/errores';
import type { Operacion } from '@/lib/propuestas';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';
import { MenuBoton, type OpcionMenu } from './MenuBoton';

/**
 * Etiquetas de operación (06 §5): alta verde, revisión azul, estado ámbar, datos y ubicación gris, retirada
 * rojo. Todas con su tinte, que cambia en oscuro (docs/38 RV-502: revisión, datos y ubicación se quedaban claras).
 */
const COLOR_OPERACION: Record<Operacion, string> = {
  alta: 'bg-tinte-verde text-tinte-verde-texto ring-1 ring-tinte-verde-borde ring-inset',
  revision: 'bg-tinte-azul text-tinte-azul-texto ring-1 ring-tinte-azul-borde ring-inset',
  estado: 'bg-tinte-ambar text-tinte-ambar-texto ring-1 ring-tinte-ambar-borde ring-inset',
  datos: 'bg-tinte-gris text-tinte-gris-texto ring-1 ring-tinte-gris-borde ring-inset',
  ubicacion: 'bg-tinte-gris text-tinte-gris-texto ring-1 ring-tinte-gris-borde ring-inset',
  retirada: 'bg-tinte-rojo text-tinte-rojo-texto ring-1 ring-tinte-rojo-borde ring-inset',
};

export function EtiquetaOperacion({ operacion }: { operacion: Operacion }) {
  return (
    <span className={cn('rounded px-1.5 py-px text-[11px] font-bold', COLOR_OPERACION[operacion])}>
      {ETIQUETA_OPERACION[operacion]}
    </span>
  );
}

/** Los tintes de las etiquetas (06 §2.4), escritos enteros para que Tailwind los encuentre. */
const TINTE = {
  verde: 'bg-tinte-verde text-tinte-verde-texto ring-tinte-verde-borde',
  ambar: 'bg-tinte-ambar text-tinte-ambar-texto ring-tinte-ambar-borde',
  rojo: 'bg-tinte-rojo text-tinte-rojo-texto ring-tinte-rojo-borde',
  gris: 'bg-tinte-gris text-tinte-gris-texto ring-tinte-gris-borde',
  azul: 'bg-tinte-azul text-tinte-azul-texto ring-tinte-azul-borde',
} as const;

/** Una etiqueta de estado (06 §5, «Panel: etiquetas de estado»): el dibujo de los chips de estado del punto. */
function Etiqueta({ tinte, children }: { tinte: keyof typeof TINTE; children: ReactNode }) {
  return (
    <span
      className={cn(
        'rounded-chip inline-block px-2 py-0.5 text-[12px] font-bold whitespace-nowrap ring-1 ring-inset',
        TINTE[tinte],
      )}
    >
      {children}
    </span>
  );
}

/** El estado de un punto (caudal), con su color: el chip que antes pintaba el Inventario (docs/38 RV-502). */
export function EtiquetaEstado({ caudal }: { caudal: string }) {
  return (
    <span
      className={cn(
        'rounded-chip inline-block px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap',
        claseChip(caudal),
      )}
    >
      {nombreCaudal(caudal)}
    </span>
  );
}

export type EstadoAcceso = 'activo' | 'pendiente' | 'sin_acceso';

/** El acceso de un administrador (DEC-215): «Activo», «Pendiente de su primer acceso» o «Sin acceso». */
export function EtiquetaAcceso({ estado }: { estado: EstadoAcceso }) {
  if (estado === 'activo') return <Etiqueta tinte="verde">{T.panelAjustes.etiquetaActivo}</Etiqueta>;
  if (estado === 'pendiente') return <Etiqueta tinte="ambar">{T.panelAjustes.pendienteVincular}</Etiqueta>;
  return <Etiqueta tinte="gris">{T.panelAjustes.etiquetaSinAcceso}</Etiqueta>;
}

export type EstadoPedido = 'pedido' | 'lanzado' | 'error';

/** El estado de un pedido de Mantenimiento (DEC-215); el motivo de un error va detrás, en texto. */
export function EtiquetaPedido({ estado }: { estado: EstadoPedido }) {
  if (estado === 'lanzado') return <Etiqueta tinte="verde">{T.panelAjustes.pedidoLanzado}</Etiqueta>;
  if (estado === 'error') return <Etiqueta tinte="rojo">{T.panelAjustes.pedidoErrorSinMotivo}</Etiqueta>;
  return <Etiqueta tinte="azul">{T.panelAjustes.pedidoPendiente}</Etiqueta>;
}

/** «Tú» y «Jefatura»: etiquetas de 11 px (06 §5). */
export function EtiquetaPequena({ tono, children }: { tono: 'gris' | 'azul'; children: ReactNode }) {
  return (
    <span className={cn('rounded-chip inline-block px-1.5 py-px text-[11px] font-bold ring-1 ring-inset', TINTE[tono])}>
      {children}
    </span>
  );
}

/**
 * Una fecha en una lista del panel (UI-12, DEC-215): «hace…» hasta 7 días y la fecha después; la exacta, en el
 * `title`, con la hora salvo `soloDia` (columnas `date`, que se leen a mediodía UTC y no cambian de día).
 */
export function Fecha({
  f,
  soloDia = false,
  ahora,
  className,
}: {
  f: Date | string | number;
  soloDia?: boolean;
  ahora?: Date;
  className?: string;
}) {
  const d = fechaDe(f);
  const exacta = soloDia ? fechaCorta(d) : T.panelRegistro.fechaHora(fechaCorta(d), horaCorta(d));
  return (
    <time dateTime={d.toISOString()} title={exacta} className={className}>
      {cuando(d, ahora)}
    </time>
  );
}

/**
 * «⋯» de una fila (06 §5, `docs/38` RV-502): un botón de icono de 44 × 44 (32 desde 1.100 px, UI-15) que abre
 * un menú con `MenuBoton`. `ref` es el botón: quien abre una ventana desde el menú le devuelve el foco al cerrarla.
 */
export function BotonMas({
  nombre,
  opciones,
  ref,
}: {
  nombre: string;
  opciones: OpcionMenu[];
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <MenuBoton
      ref={ref}
      nombre={T.panel.masAcciones(nombre)}
      opciones={opciones}
      className="rounded-boton hover:bg-fondo text-texto flex size-11 shrink-0 items-center justify-center min-[1100px]:size-8"
    >
      <Ellipsis size={20} aria-hidden />
    </MenuBoton>
  );
}

/** Una carga que falló sin nada que enseñar: qué pasó y cómo reintentar (UI-04). */
export function ErrorCarga({ codigo, alReintentar }: { codigo: string; alReintentar: () => void }) {
  return (
    <div role="alert" className="p-6 text-center text-sm">
      <p>{textoError(codigo)}</p>
      <Boton variante="secundario" className="mt-3" onClick={alReintentar}>
        {T.mapa.reintentar}
      </Boton>
    </div>
  );
}
