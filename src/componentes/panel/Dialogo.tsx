import { X } from 'lucide-react';
import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useModal } from '@/lib/foco-modal';
import { T } from '@/lib/textos';

/**
 * Diálogo centrado del panel: se cierra con Escape o con el velo, el foco entra dentro al abrir (TR-35)
 * y no sale con Tab, porque el resto de la página queda inert mientras está abierto (RV-128). Al
 * cerrar, el foco vuelve al elemento que lo tenía al abrir (docs/31 RV-160).
 */
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
  // Quien llama pasa una flecha nueva en cada render (y el panel se repinta cada minuto): se lee por
  // ref, para que Escape cierre con la última sin volver a montar nada (docs/31 RV-160).
  const cerrar = useRef(alCerrar);
  useLayoutEffect(() => {
    cerrar.current = alCerrar;
  });
  // Dónde estaba el foco al abrir, para devolverlo al cerrar. Antes que useModal: al poner inert lo de
  // detrás, el navegador suelta el foco en <body> y ya no se sabría.
  const previo = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const el = document.activeElement;
    previo.current = el instanceof HTMLElement && el !== document.body ? el : null;
  }, []);
  // Modal de verdad: lo de detrás queda inert y Tab no sale del diálogo (RV-128).
  useModal(caja);

  // El foco entra solo al abrir: un repintado del padre no lo saca del campo en que se escribe.
  // Al cerrar vuelve a donde estaba; useModal ya ha quitado el inert (es un efecto de layout).
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar.current();
    };
    window.addEventListener('keydown', tecla);
    caja.current?.focus();
    return () => {
      window.removeEventListener('keydown', tecla);
      const el = previo.current;
      if (el?.isConnected) el.focus();
    };
  }, []);

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
