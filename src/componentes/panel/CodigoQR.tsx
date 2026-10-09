import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { renderSVG } from 'uqr';
import { Boton } from '@/componentes/Boton';
import { Escudo } from '@/componentes/Escudo';
import { useModal } from '@/lib/foco-modal';
import { T } from '@/lib/textos';

/** El enlace que se imprime es el de esta misma aplicación. */
const enlaceApp = () => `${location.origin}/`;

/** Código QR del enlace (FR-162) y su versión imprimible en A4 para la sede y las reuniones. */
export function CodigoQR() {
  const [imprimible, setImprimible] = useState(false);
  const enlace = enlaceApp();
  const svg = useMemo(() => renderSVG(enlace, { border: 1 }), [enlace]);
  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <div className="size-32 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} aria-hidden />
        <div>
          <p className="font-datos text-[13px]">{enlace.replace(/^https?:\/\//, '')}</p>
          <Boton variante="secundario" className="mt-2" onClick={() => setImprimible(true)}>
            {T.panelAjustes.imprimirA4}
          </Boton>
        </div>
      </div>
      {imprimible && <HojaQR enlace={enlace} svg={svg} alCerrar={() => setImprimible(false)} />}
    </>
  );
}

/**
 * La hoja A4 a pantalla completa: una ventana de verdad (docs/32 RV-263). `role="dialog"`, el foco
 * entra en «Imprimir» al abrir, Tab no sale de ella (lo de detrás queda inert, useModal) y, al cerrar,
 * vuelve al botón que la abrió.
 */
function HojaQR({ enlace, svg, alCerrar }: { enlace: string; svg: string; alCerrar: () => void }) {
  const hoja = useRef<HTMLDivElement>(null);
  // Quien llama pasa una flecha nueva en cada render: se lee por ref, como en Dialogo.
  const cerrar = useRef(alCerrar);
  useLayoutEffect(() => {
    cerrar.current = alCerrar;
  });
  // Dónde estaba el foco al abrir, antes de que useModal ponga inert lo de detrás.
  const previo = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const el = document.activeElement;
    previo.current = el instanceof HTMLElement && el !== document.body ? el : null;
  }, []);
  useModal(hoja);

  useEffect(() => {
    document.body.classList.add('imprimiendo');
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar.current();
    };
    window.addEventListener('keydown', tecla);
    hoja.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      document.body.classList.remove('imprimiendo');
      window.removeEventListener('keydown', tecla);
      const el = previo.current;
      if (el?.isConnected) el.focus();
    };
  }, []);

  return createPortal(
    <div
      ref={hoja}
      role="dialog"
      aria-modal="true"
      aria-label={T.panelAjustes.imprimirA4}
      className="hoja-campo fixed inset-0 z-[1100] overflow-auto bg-white p-6 text-black print:static print:p-0"
    >
      <div className="mb-4 flex gap-3 print:hidden">
        <Boton onClick={() => window.print()}>{T.panelAjustes.imprimir}</Boton>
        <Boton variante="secundario" onClick={alCerrar}>
          {T.panelAjustes.cerrarHoja}
        </Boton>
      </div>
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
        <Escudo className="h-24" />
        <h2 className="font-titulo text-3xl font-bold">{T.app.nombre}</h2>
        <p className="font-titulo text-2xl">{T.panelAjustes.escaneaParaInstalar}</p>
        <div className="w-80 [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} aria-hidden />
        <p className="font-datos text-lg">{enlace.replace(/^https?:\/\//, '')}</p>
        <p className="max-w-md text-sm">{T.panelAjustes.pieCartel}</p>
      </div>
    </div>,
    document.body,
  );
}
