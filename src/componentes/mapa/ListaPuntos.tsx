import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AvisoSinPuntos } from './AvisoSinPuntos';
import { MarcadorSvg } from './MarcadorSvg';
import { CabeceraGrupo, ResultadoCoordenadas, ResultadosCallesYDirecciones } from './ResultadosLugares';
import { type Destino, hayLugares, useBusquedaLugares, useIrADestino } from '@/hooks/busqueda';
import { usePosicion, usePuntos } from '@/hooks/estado';
import { leer, escribir } from '@/lib/almacen';
import { nombreCaudal } from '@/lib/ficha';
import { distancia, hace } from '@/lib/formato';
import { leerLatLng } from '@/lib/coordenadas';
import { activarPosicion, posicionActual } from '@/lib/posicion';
import { type Filtro, type Orden, buscar, filtrar, metros, ordenar } from '@/lib/puntos';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

const FILTROS: [Filtro, string][] = [
  ['todos', T.mapa.todos],
  ['hidrantes', T.mapa.hidrantes],
  ['bocas', T.mapa.bocas],
  ['no_funciona', T.mapa.noFunciona],
  ['sin_revisar', T.mapa.sinRevisar],
];

const ORDENES: [Orden, string][] = [
  ['distancia', T.mapa.porDistancia],
  ['codigo', T.mapa.porCodigo],
  ['estado', T.mapa.porEstado],
];

/** Lista filtrable y ordenable (FR-68, FR-69). Se usa en la pestaña Lista y al lado del mapa en ordenador. */
export function ListaPuntos({
  alElegir,
  alElegirLugar,
}: {
  alElegir: (id: string) => void;
  /** Al elegir una calle, un lugar o unas coordenadas: el mapa olvida el "Sin posición" (RV-62). */
  alElegirLugar?: () => void;
}) {
  const { puntos, cargado } = usePuntos();
  usePosicion();
  // Con un incidente abierto, "por distancia" ordena desde él y no desde tu posición (FR-74). Sale de
  // la URL, como en el mapa, no de un valor recordado: al cerrarlo, vuelve a ordenar desde ti (RV-62).
  const [params] = useSearchParams();
  const incidenteParam = params.get('incidente');
  const incidente = useMemo(() => leerLatLng(incidenteParam), [incidenteParam]);
  const gps = posicionActual();
  const pos = incidente ?? gps;
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState<Filtro>(() => leer<Filtro>('filtro_lista') ?? 'todos');
  const [orden, setOrden] = useState<Orden>(() => leer<Orden>('orden_lista') ?? 'distancia');

  // Además de los puntos, calles, lugares, direcciones y coordenadas (FR-73).
  const lugares = useBusquedaLugares(texto);
  const conLugares = !!texto && hayLugares(lugares);
  const irADestino = useIrADestino();
  const irA = (d: Destino) => {
    setTexto('');
    alElegirLugar?.();
    irADestino(d);
  };

  const visibles = useMemo(
    () => ordenar(filtrar(buscar(puntos, texto), filtro), orden, pos),
    [puntos, texto, filtro, orden, pos],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pt-2">
        <label className="bg-papel border-linea rounded-campo flex min-h-11 items-center gap-2 border px-2.5">
          <Search size={18} className="text-texto-suave shrink-0" aria-hidden />
          <input
            id="buscar-lista"
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={T.mapa.buscar}
            aria-label={T.mapa.buscar}
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
          {texto && (
            <button
              type="button"
              onClick={() => setTexto('')}
              aria-label={T.mapa.borrarBusqueda}
              className="-mr-2 flex size-11 items-center justify-center"
            >
              <X size={18} aria-hidden />
            </button>
          )}
        </label>
      </div>
      <div role="radiogroup" aria-label={T.mapa.filtrar} className="flex gap-1.5 overflow-x-auto px-3 py-2">
        {FILTROS.map(([f, t]) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={filtro === f}
            onClick={() => {
              setFiltro(f);
              escribir('filtro_lista', f);
            }}
            className={cn(
              'rounded-chip min-h-11 shrink-0 border px-3 text-[13px] font-semibold',
              filtro === f ? 'bg-marino-950 border-marino-950 text-white' : 'border-linea bg-papel text-texto-suave',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="text-texto-suave flex items-center justify-between px-3 pb-2 text-[13px]">
        <label className="flex items-center gap-1.5">
          {T.mapa.orden}
          <select
            value={orden}
            onChange={(e) => {
              const o = e.target.value as Orden;
              setOrden(o);
              escribir('orden_lista', o);
              if (o === 'distancia') activarPosicion();
            }}
            className="bg-papel border-linea rounded-campo text-texto min-h-11 border px-1.5"
          >
            {ORDENES.map(([o, t]) => (
              <option key={o} value={o}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {incidente ? (
          <span>{T.incidente.desdeIncidente}</span>
        ) : (
          gps && <span>{T.mapa.gps(Math.round(gps.precision))}</span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {texto && <ResultadoCoordenadas lugares={lugares} alElegir={irA} />}
        {conLugares && visibles.length > 0 && <CabeceraGrupo titulo={T.busqueda.puntos} />}
        <ul aria-live="polite">
          {visibles.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => alElegir(p.id)}
                className="border-linea hover:bg-papel flex min-h-14 w-full items-center gap-2.5 border-b px-3 py-2 text-left"
              >
                <MarcadorSvg punto={p} tamano={24} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">
                    <span className="font-datos">{p.codigo}</span> · {T.formato.mm(p.diametro_mm)}
                  </span>
                  <span className="text-texto-suave block truncate text-[13px]">
                    {p.direccion ?? T.ficha.sinDireccion} · {nombreCaudal[p.caudal]} ·{' '}
                    {/* FR-68: la última revisión en todas las filas; caducada, en rojo (RV-24). */}
                    {p.revision_caducada ? (
                      <span className="text-rojo-700 font-semibold">
                        {T.mapa.sinRevisar} · {hace(p.fecha_ultima_revision)}
                      </span>
                    ) : (
                      T.mapa.revisado(hace(p.fecha_ultima_revision))
                    )}
                  </span>
                </span>
                {pos && (
                  <span className="text-right text-[13px] font-semibold whitespace-nowrap">
                    {distancia(metros(pos, p))}
                    <small className="text-texto-suave block font-normal">
                      {incidente ? T.mapa.desdeIncidente : T.mapa.desdeTi}
                    </small>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {texto && <ResultadosCallesYDirecciones lugares={lugares} alElegir={irA} />}
        {cargado &&
          visibles.length === 0 &&
          !conLugares &&
          (puntos.length === 0 ? (
            // Los mismos dos casos que el mapa: nunca sincronizado o inventario vacío (docs/20 RV-76).
            <AvisoSinPuntos className="text-texto-suave p-6 text-center" />
          ) : (
            <p className="text-texto-suave p-6 text-center">{texto ? T.mapa.busquedaVacia : T.mapa.filtroVacio}</p>
          ))}
      </div>
    </div>
  );
}
