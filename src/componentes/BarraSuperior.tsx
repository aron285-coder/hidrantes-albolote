import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { AvisoConexion } from './AvisoConexion';
import { PilaAvisos } from './PilaAvisos';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

// Texto --marino-950: el blanco sobre --oro-600 se queda en 3,2:1 y no llega a 4,5:1 (DEC-164).
const ETIQUETA = 'bg-oro-600 text-marino-950 flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-bold';

/** Barra superior del móvil (06 §5) con la banda de conexión y la pila de avisos debajo. */
export function BarraSuperior({
  titulo,
  alVolver,
  jefatura = false,
  enlacePanel = true,
  centrado = false,
  estado,
}: {
  titulo: string;
  alVolver?: () => void;
  jefatura?: boolean;
  /**
   * Con `false`, la etiqueta Jefatura no lleva al panel: en un formulario a medias, un toque sin
   * querer se llevaría las fotos y los datos sin preguntar (DEC-164).
   */
  enlacePanel?: boolean;
  centrado?: boolean;
  /**
   * El estado de la sincronización a la derecha (docs/33 RV-311): en el mapa y la lista sustituye a la
   * banda de conexión, que ya no se pinta debajo.
   */
  estado?: ReactNode;
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
        {/* Con un título largo a 360 px, se acorta el título con «…», nunca la etiqueta (RV-113). */}
        <h1
          className={cn(
            'font-titulo min-w-0 flex-1 truncate text-base font-semibold tracking-wide',
            centrado && 'text-center',
          )}
        >
          {titulo}
        </h1>
        {estado}
        {jefatura && enlacePanel && (
          // En el móvil, el camino al panel desde el mapa (RV-113, DEC-164). El área que se toca es de
          // 44 × 44 px (UI-15); la etiqueta de oro conserva su tamaño dentro.
          <Link
            to="/admin"
            aria-label={T.jefatura.abrirPanel}
            className="-mr-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center px-1"
          >
            <span className={ETIQUETA}>
              <span>{T.navegacion.jefatura}</span>
              <span aria-hidden="true" className="text-[13px] leading-none">
                ›
              </span>
            </span>
          </Link>
        )}
        {jefatura && !enlacePanel && <span className={cn(ETIQUETA, 'shrink-0')}>{T.navegacion.jefatura}</span>}
      </header>
      {!estado && <AvisoConexion />}
      {/* Los avisos de arriba, apilados justo debajo (docs/32 RV-238). */}
      <PilaAvisos />
    </div>
  );
}
