import { Check } from 'lucide-react';
import { Hoja } from '@/componentes/Hoja';
import { useConexion } from '@/hooks/estado';
import { CAPAS, type Capa, NOMBRE_CAPA, enLinea } from '@/lib/capas';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

/** Elección de capa (FR-63). Sin cobertura, las capas en línea salen en gris con el motivo. */
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
      <ul role="radiogroup" aria-label={titulo} className="mt-2 flex flex-col">
        {CAPAS.map((c) => {
          const bloqueada = sinRed && enLinea(c);
          return (
            <li key={c}>
              <button
                type="button"
                role="radio"
                aria-checked={actual === c}
                disabled={bloqueada}
                onClick={() => {
                  alElegir(c);
                  alCerrar();
                }}
                className={cn(
                  'border-linea flex min-h-12 w-full items-center gap-3 border-b px-1 text-left',
                  bloqueada && 'opacity-50',
                )}
              >
                <span className="flex size-6 items-center justify-center">
                  {actual === c && <Check size={18} aria-hidden />}
                </span>
                <span className="flex-1">
                  <span className="block text-[15px]">{NOMBRE_CAPA[c]}</span>
                  <span className="text-texto-suave block text-[13px]">
                    {bloqueada
                      ? T.mapa.necesitaCobertura
                      : enLinea(c)
                        ? T.mapa.soloEnLinea
                        : T.mapa.funcionaSinCobertura}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Hoja>
  );
}
