import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MarcadorSvg } from './MarcadorSvg';
import { usePosicion, usePuntos } from '@/hooks/estado';
import { leer, escribir } from '@/lib/almacen';
import { nombreCaudal } from '@/lib/ficha';
import { distancia, hace } from '@/lib/formato';
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
export function ListaPuntos({ alElegir }: { alElegir: (id: string) => void }) {
  const { puntos, cargado } = usePuntos();
  usePosicion();
  const pos = posicionActual();
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState<Filtro>(() => leer<Filtro>('filtro_lista') ?? 'todos');
  const [orden, setOrden] = useState<Orden>(() => leer<Orden>('orden_lista') ?? 'distancia');

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
              'rounded-chip min-h-9 shrink-0 border px-3 text-[13px] font-semibold',
              filtro === f ? 'bg-marino-950 border-marino-950 text-white' : 'border-linea bg-papel text-texto-suave',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="text-texto-suave flex items-center justify-between px-3 pb-1.5 text-[13px]">
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
            className="bg-papel border-linea rounded-campo text-texto min-h-9 border px-1.5"
          >
            {ORDENES.map(([o, t]) => (
              <option key={o} value={o}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {pos && <span>{T.mapa.gps(Math.round(pos.precision))}</span>}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
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
                  <small className="text-texto-suave block font-normal">{T.mapa.desdeTi}</small>
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {cargado && visibles.length === 0 && (
        <p className="text-texto-suave p-6 text-center">
          {puntos.length === 0 ? T.mapa.sinPuntos : texto ? T.mapa.busquedaVacia : T.mapa.filtroVacio}
        </p>
      )}
    </div>
  );
}
