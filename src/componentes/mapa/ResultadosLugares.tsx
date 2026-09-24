import { Landmark, LocateFixed, MapPin, Route } from 'lucide-react';
import type { Destino, Lugares } from '@/hooks/busqueda';
import { formatoDecimal } from '@/lib/coordenadas';
import { T } from '@/lib/textos';

const fila = 'border-linea flex min-h-13 w-full items-center gap-2 border-b px-2.5 text-left text-sm';
const aviso = 'text-texto-suave border-linea border-b px-2.5 py-2 text-[13px]';

function Cabecera({ titulo, fuente }: { titulo: string; fuente?: string }) {
  return (
    <p className="text-texto-suave flex items-baseline justify-between gap-2 px-2.5 pt-2 pb-1 text-[12px] font-semibold">
      <span>{titulo}</span>
      {fuente && <span className="font-normal">{fuente}</span>}
    </p>
  );
}

/**
 * Unas coordenadas pegadas: un único resultado arriba (FR-73). Fuera de la zona se aceptan, con el
 * aviso (FR-55). Un enlace corto no se puede leer, y se dice (UI-05).
 */
export function ResultadoCoordenadas({ lugares, alElegir }: { lugares: Lugares; alElegir: (d: Destino) => void }) {
  if (lugares.enlaceCorto) {
    return (
      <p role="status" className={aviso}>
        {T.busqueda.enlaceCorto}
      </p>
    );
  }
  const l = lugares.coordenadas;
  if (!l) return null;
  return (
    <button type="button" onClick={() => alElegir({ tipo: 'sitio', l })} className={fila}>
      <LocateFixed size={18} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="font-datos block truncate">{T.busqueda.coordenadas(formatoDecimal(l))}</span>
        {lugares.fueraDeZona && (
          <span className="text-ambar-700 block text-[12px] font-semibold">{T.busqueda.fueraDeZona}</span>
        )}
      </span>
    </button>
  );
}

/**
 * Calles y lugares del callejero, que funcionan sin cobertura, y después las direcciones con número,
 * que la necesitan. Cada grupo cita su fuente (TR-76, TR-77).
 */
export function ResultadosCallesYDirecciones({
  lugares,
  alElegir,
}: {
  lugares: Lugares;
  alElegir: (d: Destino) => void;
}) {
  const { calles, direcciones } = lugares;
  return (
    <>
      {calles.length > 0 && (
        <div role="group" aria-label={T.busqueda.calles}>
          <Cabecera titulo={T.busqueda.calles} fuente={T.busqueda.fuenteCalles} />
          <ul>
            {calles.map((c) => (
              <li key={`${c.n}|${c.m ?? ''}|${c.t}`}>
                <button
                  type="button"
                  onClick={() =>
                    alElegir(
                      c.t === 'calle'
                        ? { tipo: 'calle', calle: c }
                        : { tipo: 'sitio', l: { lat: c.c![1], lng: c.c![0] } },
                    )
                  }
                  className={fila}
                >
                  {c.t === 'calle' ? (
                    <Route size={18} className="shrink-0" aria-hidden />
                  ) : (
                    <Landmark size={18} className="shrink-0" aria-hidden />
                  )}
                  <span className="truncate">
                    {c.n}
                    {c.m && <span className="text-texto-suave"> · {T.busqueda.municipio[c.m]}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {direcciones.estado !== 'nada' && (
        <div role="group" aria-label={T.busqueda.direcciones}>
          <Cabecera
            titulo={T.busqueda.direcciones}
            fuente={direcciones.estado === 'ok' ? T.busqueda.fuenteDirecciones : undefined}
          />
          {direcciones.estado === 'buscando' && (
            <p role="status" className={aviso}>
              {T.busqueda.buscandoDirecciones}
            </p>
          )}
          {direcciones.estado === 'sin_cobertura' && (
            <p role="status" className={aviso}>
              {T.busqueda.portalSinCobertura}
            </p>
          )}
          {direcciones.estado === 'ok' && direcciones.resultados.length === 0 && (
            <p role="status" className={aviso}>
              {T.busqueda.sinDirecciones}
            </p>
          )}
          {direcciones.estado === 'ok' && direcciones.resultados.length > 0 && (
            <ul>
              {direcciones.resultados.map((d) => (
                <li key={`${d.etiqueta}|${d.lat}|${d.lng}`}>
                  <button
                    type="button"
                    onClick={() => alElegir({ tipo: 'sitio', l: { lat: d.lat, lng: d.lng } })}
                    className={fila}
                  >
                    <MapPin size={18} className="shrink-0" aria-hidden />
                    <span className="truncate">{d.etiqueta}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

export { Cabecera as CabeceraGrupo };
