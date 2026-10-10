// Piezas pequeñas del panel que se repiten entre pestañas (06 §5).

import { Boton } from '@/componentes/Boton';
import { ETIQUETA_OPERACION } from '@/lib/nombres-operacion';
import { textoError } from '@/lib/panel/errores';
import type { Operacion } from '@/lib/propuestas';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

/** Etiquetas de operación (06 §5): alta verde, revisión azul, estado ámbar, datos y ubicación gris, retirada rojo. */
const COLOR_OPERACION: Record<Operacion, string> = {
  alta: 'bg-tinte-verde text-tinte-verde-texto ring-1 ring-tinte-verde-borde ring-inset',
  revision: 'bg-[#DCE6F2] text-marino-700',
  estado: 'bg-tinte-ambar text-tinte-ambar-texto ring-1 ring-tinte-ambar-borde ring-inset',
  datos: 'bg-gris-100 text-gris-700',
  ubicacion: 'bg-gris-100 text-gris-700',
  retirada: 'bg-tinte-rojo text-tinte-rojo-texto ring-1 ring-tinte-rojo-borde ring-inset',
};

export function EtiquetaOperacion({ operacion }: { operacion: Operacion }) {
  return (
    <span className={cn('rounded px-1.5 py-px text-[11px] font-bold', COLOR_OPERACION[operacion])}>
      {ETIQUETA_OPERACION[operacion]}
    </span>
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
