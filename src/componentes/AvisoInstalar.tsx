import { Download, X } from 'lucide-react';
import { useAvisoInstalarCerrado, useInstalar } from '@/hooks/estado';
import { cerrarAvisoInstalar, instalar } from '@/lib/instalar';
import { T } from '@/lib/textos';

/** Aviso en el mapa para instalar la app, mientras el navegador lo permita y no se haya cerrado. */
export function AvisoInstalar() {
  const estado = useInstalar();
  const cerrado = useAvisoInstalarCerrado();
  if (estado !== 'disponible' || cerrado) return null;
  return (
    <div className="bg-marino-950 flex items-center gap-2 px-3 py-1.5 text-sm text-white">
      <Download size={18} aria-hidden className="shrink-0" />
      <span className="flex-1">{T.instalar.aviso}</span>
      <button
        type="button"
        onClick={() => void instalar()}
        className="bg-naranja-600 rounded-boton min-h-11 px-3 font-semibold"
      >
        {T.instalar.boton}
      </button>
      <button
        type="button"
        onClick={cerrarAvisoInstalar}
        aria-label={T.ficha.cerrar}
        className="flex size-11 items-center justify-center"
      >
        <X size={18} aria-hidden />
      </button>
    </div>
  );
}
