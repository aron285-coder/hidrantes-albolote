// Lo de Editar que el Inventario necesita sin cargar Editar (docs/29 RV-124): la pregunta de
// descartar y el estado que Editar le cuenta (la entrada de historial está en
// `@/lib/panel/historial-editar`, RV-129). Editar va en su propia porción
// (lazy): con el mapa y los controles del alta dentro de la porción del Inventario, Rollup juntaba en
// una sola las piezas que comparte con la app y la carga con sesión se hacía más lenta (RV-80).

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Boton } from '@/componentes/Boton';
import { T } from '@/lib/textos';

/** "¿Descartar N cambios?" antes de cerrar Editar o de pasar a otro punto con cambios sin guardar. */
export function ConfirmarDescartar({
  n,
  alDescartar,
  alSeguir,
}: {
  n: number;
  alDescartar: () => void;
  alSeguir: () => void;
}) {
  const titulo = useId();
  const seguir = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    seguir.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      alSeguir();
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [alSeguir]);
  return createPortal(
    <div className="fixed inset-0 z-[1050] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[rgba(14,27,48,.38)]" onClick={alSeguir} aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titulo}
        className="bg-papel rounded-tarjeta relative w-full max-w-sm p-4 shadow-[0_6px_24px_rgba(14,27,48,.28)]"
      >
        <h2 id={titulo} className="font-titulo mb-4 text-[17px] font-semibold">
          {T.panelEditar.descartarN(n)}
        </h2>
        <div className="flex flex-wrap justify-end gap-3">
          <Boton variante="secundario" onClick={alDescartar}>
            {T.panelEditar.descartar}
          </Boton>
          {/* Seguir editando es lo seguro: recibe el foco y es lo que hace Esc. */}
          <button
            ref={seguir}
            type="button"
            onClick={alSeguir}
            className="rounded-boton bg-naranja-600 min-h-11 min-w-11 px-4 text-[15px] font-semibold text-white"
          >
            {T.panelEditar.seguirEditando}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Lo que el Inventario necesita saber de Editar: cambios sin guardar y si está guardando. */
export interface EstadoEditar {
  pendientes: number;
  ocupado: boolean;
}
