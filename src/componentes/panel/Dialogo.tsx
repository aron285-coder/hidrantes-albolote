import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { T } from '@/lib/textos';

/** Diálogo centrado del panel: se cierra con Escape o con el velo, y el foco entra dentro (TR-35). */
export function Dialogo({
  titulo,
  ancho = 'max-w-lg',
  alCerrar,
  children,
}: {
  titulo: string;
  ancho?: string;
  alCerrar: () => void;
  children: ReactNode;
}) {
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar();
    };
    window.addEventListener('keydown', tecla);
    caja.current?.focus();
    return () => window.removeEventListener('keydown', tecla);
  }, [alCerrar]);

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[rgba(14,27,48,.38)]" onClick={alCerrar} aria-hidden />
      <div
        ref={caja}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className={`bg-papel rounded-tarjeta relative max-h-[85vh] w-full overflow-y-auto p-4 shadow-[0_6px_24px_rgba(14,27,48,.28)] ${ancho}`}
      >
        <div className="mb-3 flex items-start gap-2">
          <h2 className="font-titulo flex-1 text-[17px] font-semibold">{titulo}</h2>
          <button
            type="button"
            onClick={alCerrar}
            aria-label={T.ficha.cerrar}
            className="-mt-1 -mr-1 flex size-9 items-center justify-center"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
