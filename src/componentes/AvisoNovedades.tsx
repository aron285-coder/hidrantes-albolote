import { X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useNovedades } from '@/hooks/cola';
import { marcarVistas } from '@/lib/mis-propuestas';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

/** Al abrir, el resultado de lo propuesto desde la última vez (FR-90). Toast de 06 §5. */
export function AvisoNovedades() {
  const novedades = useNovedades();
  const navegar = useNavigate();
  if (!novedades.length) return null;
  const rechazada = novedades.find((n) => n.estado === 'rechazada');
  const principal = rechazada ?? novedades[0];
  const texto =
    principal.estado === 'rechazada'
      ? T.misPropuestas.rechazadaAviso(principal.codigo ?? T.misPropuestas.nuevo)
      : T.misPropuestas.aprobadaAviso(principal.codigo ?? T.misPropuestas.nuevo);
  return (
    <div
      role="status"
      className={cn(
        'rounded-boton fixed inset-x-3 top-[calc(env(safe-area-inset-top)+3.5rem)] z-30 mx-auto flex max-w-md items-start gap-2 px-3 py-2 text-white shadow-lg',
        principal.estado === 'rechazada' ? 'bg-rojo-700' : 'bg-verde-600',
      )}
    >
      <button
        type="button"
        className="min-h-11 flex-1 text-left"
        onClick={() => {
          marcarVistas();
          navegar('/mis-propuestas');
        }}
      >
        <span className="block font-semibold">
          {texto}
          {novedades.length > 1 && ` · +${novedades.length - 1}`}
        </span>
        {principal.motivo_rechazo && (
          <span className="block text-sm opacity-90">{T.misPropuestas.motivo(principal.motivo_rechazo)}</span>
        )}
      </button>
      <button
        type="button"
        onClick={marcarVistas}
        aria-label={T.ficha.cerrar}
        className="flex size-11 items-center justify-center"
      >
        <X size={18} aria-hidden />
      </button>
    </div>
  );
}
