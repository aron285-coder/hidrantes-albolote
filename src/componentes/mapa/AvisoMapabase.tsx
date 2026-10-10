import { X } from 'lucide-react';
import { useState } from 'react';
import { type HitoDescarga, hitoDescarga } from '@/lib/anuncio-descarga';
import { useMapabase } from '@/hooks/estado';
import { megas } from '@/lib/formato';
import { BYTES_MAPABASE, descargarMapabase, hayVersionNuevaMapabase } from '@/lib/mapabase';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

/**
 * FR-81: si falta el mapa base, el mapa lo avisa al arrancar, con red o sin ella, y ofrece
 * descargarlo; una versión nueva también se ofrece aquí, no solo en Ajustes (RV-10). Con datos
 * móviles no se descarga sin preguntar: el botón es la pregunta.
 */
/** "Ocultar" el aviso de versión nueva vale para toda la sesión, no solo mientras se ve el mapa. */
let versionNuevaOculta = false;

export function AvisoMapabase({ sinRed }: { sinRed: boolean }) {
  const mapabase = useMapabase();
  const [oculto, setOculto] = useState(versionNuevaOculta);
  const clase = 'bg-tinte-oro border-oro-600 text-tinte-oro-texto rounded-tarjeta border px-2.5 py-1.5 text-[13px]';
  const nueva = hayVersionNuevaMapabase(mapabase);
  if (mapabase.descargado && (!nueva || oculto)) return null;
  if (!mapabase.descargado && sinRed) {
    return (
      <p role="status" className={clase}>
        {T.mapa.mapaNoDescargado}
      </p>
    );
  }
  // Mientras descarga, el botón se cambia por el progreso: nunca un botón deshabilitado sin motivo (UI-02).
  const accion =
    mapabase.progreso !== null ? (
      <span className="font-semibold">{T.ajustes.descargando(mapabase.progreso)}</span>
    ) : (
      <button type="button" className="min-h-11 font-semibold underline" onClick={() => void descargarMapabase()}>
        {mapabase.parada
          ? T.ajustes.reintentar
          : mapabase.descargado
            ? T.mapa.descargarVersionNueva
            : T.mapa.descargarMapabase(megas(BYTES_MAPABASE))}
      </button>
    );
  // Sin role="status": el porcentaje cambia a cada trozo y el lector lo leería entero cada vez. Lo que
  // se anuncia lo dice AnuncioDescarga, siempre montado en App.tsx (RV-236).
  return (
    <div className={cn(clase, 'flex flex-wrap items-center gap-x-3')} data-testid="aviso-mapabase">
      <span className="flex-1">{mapabase.descargado ? T.ajustes.versionNuevaMapa : T.mapa.mapabaseFalta}</span>
      {accion}
      {mapabase.fallo && (
        // La descarga parada (30 s sin llegar nada, RV-235) lo dice; el botón de al lado es «Reintentar».
        <span className="text-rojo-texto w-full">
          {mapabase.parada ? T.ajustes.descargaParada : T.ajustes.falloDescarga}
        </span>
      )}
      {mapabase.descargado && mapabase.progreso === null && (
        <button
          type="button"
          aria-label={T.mapa.ocultarAviso}
          title={T.mapa.ocultarAviso}
          onClick={() => {
            versionNuevaOculta = true;
            setOculto(true);
          }}
          className="-mr-2 flex size-11 items-center justify-center"
        >
          <X size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * La región viva de la descarga del mapa base (docs/32 RV-236): solo el inicio, la mitad, el final y
 * los errores. Va siempre montada (App.tsx), en cualquier pantalla: el aviso desaparece al terminar, la
 * descarga puede empezar en Ajustes, y el final o el error se tienen que oír igual.
 */
export function AnuncioDescarga() {
  const mapabase = useMapabase();
  const [hito, setHito] = useState<HitoDescarga | null>(null);
  const actual = hitoDescarga(hito, mapabase);
  // Estado derivado del render, el patrón de React para recordar el hito anterior.
  if (actual !== hito) setHito(actual);
  return (
    // aria-live y no role="status": una región que está en todas las pantallas no cuenta como «el
    // estado» de ninguna (la banda de pruebas, el sello de la barra), y sigue anunciándose igual.
    <span aria-live="polite" aria-atomic="true" className="sr-only">
      {actual ? T.mapa.anuncioDescarga[actual] : ''}
    </span>
  );
}
