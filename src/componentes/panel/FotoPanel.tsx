import { useState } from 'react';
import { anotarError } from '@/lib/errores';
import { urlFoto } from '@/lib/ficha';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

/**
 * Una foto del panel con su etiqueta abajo a la izquierda (06 §5): en la cola y, desde `docs/39` RV-523 (DEC-222), en
 * Editar. Tocarla la abre en grande. Si no carga, el texto en su hueco y se anota (UI-04). La pide el navegador con
 * CORS, para que la caché del Service Worker guarde la respuesta completa (RV-12): una foto ya vista se ve sin
 * cobertura.
 */
export function FotoPanel({
  path,
  etiqueta,
  nueva = false,
  alto,
  donde,
}: {
  path: string;
  etiqueta: string;
  /** Nueva frente a la actual del punto: la etiqueta en naranja (la cola). */
  nueva?: boolean;
  /** Las clases del alto (cambian por ancho). */
  alto: string;
  /** Para el registro de errores: dónde estaba la foto que no ha cargado. */
  donde: string;
}) {
  const url = urlFoto(path);
  const [fallo, setFallo] = useState(false);
  return (
    <figure className="relative min-w-0">
      {url && !fallo ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded-tarjeta block overflow-hidden"
          aria-label={T.panelCola.ampliarFoto(etiqueta)}
        >
          <img
            crossOrigin="anonymous"
            src={url}
            alt={etiqueta}
            onError={() => {
              setFallo(true);
              anotarError(new Error(`panel: una foto ${donde} no carga`));
            }}
            className={cn('w-full bg-[linear-gradient(180deg,#C6D2DA,#8C968F)] object-cover', alto)}
          />
        </a>
      ) : (
        <div
          className={cn(
            'bg-linea text-texto rounded-tarjeta flex items-center justify-center px-2 pb-8 text-center text-[13px]',
            alto,
          )}
        >
          {T.panelCola.fotoNoCarga}
        </div>
      )}
      <figcaption
        className={cn(
          'pointer-events-none absolute bottom-2 left-2 rounded-md px-2 py-0.5 text-[12px] text-white',
          nueva ? 'bg-naranja-600' : 'bg-[rgba(14,27,48,.8)]',
        )}
      >
        {etiqueta}
      </figcaption>
    </figure>
  );
}
