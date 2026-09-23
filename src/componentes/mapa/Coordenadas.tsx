import { Copy, Share2 } from 'lucide-react';
import { useState } from 'react';
import { type LatLng, aUtm, dentroDelHuso, formatoDecimal, formatoUtm } from '@/lib/coordenadas';
import { compartir, copiar } from '@/lib/compartir';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

const aviso = 'text-texto-suave text-[13px]';

/**
 * Coordenadas en decimal y en UTM ETRS89 huso 30, cada una con su botón de copiar (FR-75). Si el
 * navegador no deja copiar, se dice y el texto queda a la vista para copiarlo a mano (UI-05).
 */
export function BloqueCoordenadas({ l }: { l: LatLng }) {
  const [estado, setEstado] = useState<'copiado' | 'fallo' | null>(null);
  const filas: [string, string][] = [[T.coordenadas.decimal, formatoDecimal(l)]];
  if (dentroDelHuso(l)) filas.push([T.coordenadas.utm, formatoUtm(aUtm(l), l.lat)]);
  return (
    <section className="bg-papel border-linea rounded-tarjeta border px-2.5 py-1.5" aria-label={T.coordenadas.titulo}>
      <div className="text-texto-suave text-[13px]">{T.coordenadas.titulo}</div>
      {filas.map(([que, valor], i) => (
        // 8 px entre los dos botones de copiar, uno encima del otro (UI-15, TR-113).
        <div key={que} className={cn('flex items-center gap-2', i > 0 && 'mt-2')}>
          <div className="min-w-0 flex-1">
            <div className="text-texto-suave text-[12px]">{que}</div>
            <div className="font-datos text-[14px] select-all">{valor}</div>
          </div>
          <button
            type="button"
            aria-label={T.coordenadas.copiar(que)}
            title={T.coordenadas.copiar(que)}
            onClick={() => void copiar(valor).then(setEstado)}
            className="flex size-11 shrink-0 items-center justify-center"
          >
            <Copy size={18} aria-hidden />
          </button>
        </div>
      ))}
      {estado && (
        <p role="status" className={aviso}>
          {estado === 'copiado' ? T.coordenadas.copiado : T.coordenadas.noSeCopia}
        </p>
      )}
    </section>
  );
}

/**
 * Compartir con el menú del móvil, o copiar donde no lo haya (FR-75). Si no se puede ninguna de las
 * dos cosas, el texto aparece seleccionable debajo: nunca un fallo silencioso (UI-05).
 */
export function BotonCompartir({
  titulo,
  texto,
  etiqueta = T.compartir.boton,
  className,
}: {
  titulo: string;
  texto: string;
  etiqueta?: string;
  className?: string;
}) {
  const [estado, setEstado] = useState<'copiado' | 'fallo' | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={() =>
          void compartir(titulo, texto).then((r) => setEstado(r === 'copiado' || r === 'fallo' ? r : null))
        }
        className={cn(
          'bg-papel border-texto text-texto rounded-boton flex min-h-11 items-center justify-center gap-2 border-[1.5px] px-3 text-[15px] font-semibold',
          className,
        )}
      >
        <Share2 size={18} aria-hidden />
        {etiqueta}
      </button>
      {estado === 'copiado' && (
        <p role="status" className={cn(aviso, 'w-full')}>
          {T.compartir.copiado}
        </p>
      )}
      {estado === 'fallo' && (
        <div role="status" className="w-full">
          <p className={aviso}>{T.compartir.noSePuede}</p>
          <textarea
            readOnly
            value={texto}
            aria-label={titulo}
            rows={4}
            className="border-linea rounded-campo font-datos mt-1 w-full border p-2 text-[13px] select-all"
          />
        </div>
      )}
    </>
  );
}
