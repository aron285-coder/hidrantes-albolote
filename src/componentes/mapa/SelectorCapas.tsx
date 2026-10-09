import { Check } from 'lucide-react';
import { Hoja } from '@/componentes/Hoja';
import { useConexion } from '@/hooks/estado';
import { CAPAS, type Capa, MINIATURA_CAPA, NOMBRE_CAPA, PARA_QUE_CAPA, enLinea } from '@/lib/capas';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

/**
 * Elección de capa (FR-63), en palabras y con una miniatura de cada una (docs/33 RV-317, U8). Las
 * fuentes, solo en una línea al pie. Sin cobertura, las capas en línea salen en gris: su texto ya dice
 * que necesitan cobertura (UI-03).
 *
 * Un `radiogroup` con los `radio` como hijos directos (D11): con una lista `ul`/`li` por medio, axe
 * fallaba porque un `li` no puede estar dentro de un grupo de radios.
 */
export function SelectorCapas({
  titulo,
  actual,
  alElegir,
  alCerrar,
}: {
  titulo: string;
  actual: Capa;
  alElegir: (c: Capa) => void;
  alCerrar: () => void;
}) {
  const conexion = useConexion();
  const sinRed = conexion === 'sin_cobertura';
  return (
    <Hoja titulo={titulo} alCerrar={alCerrar}>
      <div role="radiogroup" aria-label={titulo} className="mt-2 flex flex-col">
        {CAPAS.map((c) => {
          const bloqueada = sinRed && enLinea(c);
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={actual === c}
              disabled={bloqueada}
              onClick={() => {
                alElegir(c);
                alCerrar();
              }}
              className={cn(
                'border-linea flex min-h-16 w-full items-center gap-3 border-b px-1 py-2 text-left',
                bloqueada && 'opacity-50',
              )}
            >
              <img
                src={MINIATURA_CAPA[c]}
                alt=""
                width={64}
                height={43}
                className="rounded-campo border-linea h-[43px] w-16 shrink-0 border object-cover"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{NOMBRE_CAPA[c]}</span>
                <span className="text-texto-suave block text-[13px]">
                  {enLinea(c) ? `${PARA_QUE_CAPA[c]} · ${T.mapa.necesitaCobertura}` : PARA_QUE_CAPA[c]}
                </span>
              </span>
              <span className="flex size-6 shrink-0 items-center justify-center">
                {actual === c && <Check size={18} aria-hidden />}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-texto-suave mt-2 text-[12px]">{T.capas.fuentes}</p>
    </Hoja>
  );
}
