import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Boton } from '@/componentes/Boton';
import { marcarPrimerUsoVisto } from '@/lib/sesion';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

const PANTALLAS = T.bienvenida.pantallas;

/** Tres pantallas de primer uso (FR-94), saltables y recuperables desde Ajustes. */
export function Bienvenida() {
  const [n, setN] = useState(0);
  const navegar = useNavigate();
  const ultima = n === PANTALLAS.length - 1;

  function terminar() {
    marcarPrimerUsoVisto();
    navegar('/', { replace: true });
  }

  return (
    <div className="bg-marino-950 flex flex-1 flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white">
      <div className="flex justify-end">
        <Boton variante="enlace" className="text-white/80" onClick={terminar}>
          {T.bienvenida.saltar}
        </Boton>
      </div>
      <section aria-live="polite" className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        <p className="sr-only">{T.bienvenida.paso(n + 1)}</p>
        <h1 className="font-titulo mb-3 text-2xl font-bold">{PANTALLAS[n].titulo}</h1>
        <p className="text-white/85">{PANTALLAS[n].texto}</p>
      </section>
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-4 flex justify-center gap-2" aria-hidden>
          {PANTALLAS.map((_, i) => (
            <span key={i} className={cn('h-2 rounded-full', i === n ? 'bg-naranja-500 w-5' : 'w-2 bg-white/35')} />
          ))}
        </div>
        <Boton className="w-full" onClick={() => (ultima ? terminar() : setN(n + 1))}>
          {ultima ? T.bienvenida.empezar : T.bienvenida.siguiente}
        </Boton>
      </div>
    </div>
  );
}
