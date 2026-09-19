import { RefreshCw } from 'lucide-react';
import { useVersionNueva } from '@/hooks/version';
import { recargar } from '@/lib/pwa';
import { T } from '@/lib/textos';

/** Aviso de versión nueva (TR-24): arriba, bajo la barra, hasta que se recargue. */
export function AvisoVersion() {
  const hay = useVersionNueva();
  if (!hay) return null;
  return (
    <button
      type="button"
      onClick={recargar}
      className="bg-marino-700 rounded-boton fixed inset-x-3 top-[calc(env(safe-area-inset-top)+3.5rem)] z-30 mx-auto flex min-h-11 max-w-md items-center gap-2 px-3 text-left text-sm font-semibold text-white shadow-lg"
    >
      <RefreshCw size={18} aria-hidden />
      {T.ajustes.versionNueva}
    </button>
  );
}
