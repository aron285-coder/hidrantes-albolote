import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useModal } from '@/lib/foco-modal';

/**
 * Hoja inferior sobre un velo (06 §5). Se cierra con el velo o con Escape. Se pinta en <body> para
 * quedar siempre encima, aunque se abra desde la ficha flotante sobre el mapa.
 *
 * Es una ventana modal de verdad (docs/32 RV-237): el resto de la página queda `inert` mientras está
 * abierta (useModal, el mismo del panel), el foco entra en la hoja al abrir y vuelve al cerrar a donde
 * estaba.
 */
export function Hoja({
  titulo,
  alCerrar,
  children,
  tituloVisible = true,
}: {
  titulo: string;
  alCerrar: () => void;
  children: ReactNode;
  /** Sin título a la vista, el diálogo sigue teniendo nombre (aria-label, WCAG 4.1.2; docs/24 RV-99). */
  tituloVisible?: boolean;
}) {
  const ventana = useRef<HTMLDivElement>(null);
  // El foco de antes de abrir, leído en el primer render: después, al poner inert a lo de detrás, el
  // navegador lo suelta en <body>.
  const [antes] = useState(() => (typeof document === 'undefined' ? null : document.activeElement));
  useModal(ventana);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [alCerrar]);
  useEffect(() => {
    // Al diálogo entero, no al primer botón: el primero suele ser el destructivo (Cerrar sesión,
    // Descartar) y el lector empieza por el título.
    ventana.current?.focus({ preventScroll: true });
    return () => {
      // Al desmontar, useModal ya ha quitado el inert (su limpieza va antes): el botón vuelve a admitir foco.
      if (antes instanceof HTMLElement && antes.isConnected) antes.focus({ preventScroll: true });
    };
  }, [antes]);
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-end justify-center">
      <div className="absolute inset-0 bg-[rgba(14,27,48,.38)]" onClick={alCerrar} aria-hidden />
      <div
        ref={ventana}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className="bg-papel rounded-t-hoja relative w-full max-w-md p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(14,27,48,.22)] outline-none"
      >
        <div className="bg-linea mx-auto mb-3 h-1 w-[34px] rounded-full" aria-hidden />
        {tituloVisible && <h2 className="mb-1 text-[15px] font-bold">{titulo}</h2>}
        {children}
      </div>
    </div>,
    document.body,
  );
}
