import { MapPinPlus, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { BloqueCoordenadas, BotonCompartir } from './Coordenadas';
import { Hoja } from '../Hoja';
import type { LatLng } from '@/lib/coordenadas';
import { textoUbicacion } from '@/lib/compartir';
import { rutaAltaEn } from '@/lib/propuestas';
import { T } from '@/lib/textos';

const accion =
  'bg-papel border-texto text-texto rounded-boton flex min-h-11 w-full items-center justify-center gap-2 border-[1.5px] px-3 text-[15px] font-semibold';

/**
 * "¿Qué hay aquí?" (FR-72, docs/18 GM-02): coordenadas del sitio pulsado y lo que se puede hacer
 * desde él. En el móvil, hoja inferior; en tableta y ordenador, panel flotante como la ficha (FR-70).
 * Funciona sin cobertura. *Atrás* la cierra, porque el sitio va en la URL (`?aqui=lat,lng`).
 */
export function QueHayAqui({ l, alCerrar, enHoja }: { l: LatLng; alCerrar: () => void; enHoja: boolean }) {
  const navegar = useNavigate();
  const contenido = (
    <div className="flex flex-col gap-2">
      <BloqueCoordenadas l={l} />
      <div className="flex flex-col gap-3">
        <BotonCompartir
          titulo={T.compartir.tituloUbicacion}
          texto={textoUbicacion(l)}
          etiqueta={T.aqui.compartirUbicacion}
          className="w-full"
        />
        <button type="button" onClick={() => navegar(rutaAltaEn(l.lat, l.lng))} className={accion}>
          <MapPinPlus size={18} aria-hidden />
          {T.aqui.anadirPunto}
        </button>
      </div>
    </div>
  );
  if (enHoja) {
    return (
      <Hoja titulo={T.aqui.titulo} alCerrar={alCerrar}>
        {contenido}
      </Hoja>
    );
  }
  return (
    <aside
      role="dialog"
      aria-label={T.aqui.titulo}
      className="bg-fondo rounded-tarjeta absolute top-2 right-16 z-[600] max-h-[calc(100%-1rem)] w-[min(360px,calc(100%-5rem))] overflow-y-auto p-3 shadow-xl"
    >
      <header className="mb-1 flex items-center gap-2">
        <h2 className="flex-1 text-[15px] font-bold">{T.aqui.titulo}</h2>
        <button
          type="button"
          onClick={alCerrar}
          aria-label={T.ficha.cerrar}
          className="flex size-11 items-center justify-center"
        >
          <X size={20} aria-hidden />
        </button>
      </header>
      {contenido}
    </aside>
  );
}
