// Mapa o lista sin ningún punto (docs/20 RV-76). Dos casos distintos:
// - nunca se ha sincronizado: los puntos llegarán en cuanto haya conexión;
// - ya se sincronizó y el inventario está vacío, como el primer día de producción (DEC-051): decir
//   "sin conexión" sería falso, así que se dice que no hay ninguno y cómo dar de alta el primero.

import { MapPinPlus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { usePuntos } from '@/hooks/estado';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

export function AvisoSinPuntos({ className }: { className?: string }) {
  const { sincronizadoEn } = usePuntos();
  const navegar = useNavigate();
  if (sincronizadoEn === null) {
    return (
      <p role="status" className={className} data-testid="aviso-sin-puntos">
        {T.mapa.sinPuntos}
      </p>
    );
  }
  return (
    <div role="status" className={cn('flex flex-col items-center gap-2', className)} data-testid="aviso-sin-puntos">
      <p>{T.mapa.inventarioVacio}</p>
      {/* El alta coloca el pin con la posición GPS si la hay (FL-03). */}
      <button
        type="button"
        onClick={() => navegar('/proponer/alta')}
        className="bg-naranja-600 rounded-boton inline-flex min-h-11 items-center gap-2 px-4 font-semibold text-white"
      >
        <MapPinPlus size={18} aria-hidden />
        {T.mapa.anadirUnPunto}
      </button>
    </div>
  );
}
