import { ChevronLeft } from 'lucide-react';
import { AvisoConexion } from './AvisoConexion';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

/** Barra superior del móvil (06 §5) con la banda de conexión debajo. */
export function BarraSuperior({
  titulo,
  alVolver,
  jefatura = false,
  centrado = false,
}: {
  titulo: string;
  alVolver?: () => void;
  jefatura?: boolean;
  centrado?: boolean;
}) {
  return (
    <div className="sticky top-0 z-20">
      <header className="bg-barra flex min-h-12 items-center gap-1 px-3 pt-[env(safe-area-inset-top)] text-white">
        {alVolver && (
          <button
            type="button"
            onClick={alVolver}
            aria-label={T.entrada.volver}
            className="-ml-2 flex size-11 items-center justify-center"
          >
            <ChevronLeft size={22} aria-hidden />
          </button>
        )}
        <h1 className={cn('font-titulo flex-1 text-base font-semibold tracking-wide', centrado && 'text-center')}>
          {titulo}
        </h1>
        {jefatura && (
          <span className="bg-oro-600 rounded px-1.5 py-0.5 text-[11px] font-bold text-white">
            {T.navegacion.jefatura}
          </span>
        )}
      </header>
      <AvisoConexion />
    </div>
  );
}
