import { type ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Hoja inferior sobre un velo (06 §5). Se cierra con el velo o con Escape. Se pinta en <body> para
 * quedar siempre encima, aunque se abra desde la ficha flotante sobre el mapa.
 */
export function Hoja({ titulo, alCerrar, children }: { titulo: string; alCerrar: () => void; children: ReactNode }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [alCerrar]);
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-end justify-center">
      <div className="absolute inset-0 bg-[rgba(14,27,48,.38)]" onClick={alCerrar} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="bg-papel rounded-t-hoja relative w-full max-w-md p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(14,27,48,.22)]"
      >
        <div className="bg-linea mx-auto mb-3 h-1 w-[34px] rounded-full" aria-hidden />
        <h2 className="mb-1 text-[15px] font-bold">{titulo}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
