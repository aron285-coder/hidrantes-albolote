import { useMemo, useState } from 'react';
import { Dato, FilaApilada, FilasApiladas } from './filas-apiladas';
import { ErrorCarga } from './piezas';
import { usePanel } from './usar-panel';
import { Boton } from '@/componentes/Boton';
import { useAncho } from '@/hooks/ancho';
import { useCarga } from '@/hooks/carga';
import { fechaCorta, hace } from '@/lib/formato';
import { NOMBRE_ACCION, POR_PAGINA, cargarRegistro, nombreAccion, paginas } from '@/lib/panel/inventario';
import { textoError } from '@/lib/panel/errores';
import { detalleLegible } from '@/lib/panel/registro-legible';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

const COLUMNAS = [
  T.panelRegistro.colMomento,
  T.panelRegistro.colActor,
  T.panelRegistro.colAccion,
  T.panelRegistro.colPunto,
  T.panelRegistro.colDetalle,
];

/** Registro de auditoría (FR-123, FL-26): solo lectura, con filtro por acción y paginación. */
export default function Registro() {
  const { busqueda } = usePanel();
  // Por debajo de md, filas apiladas: a 412 px la tabla se salía por la derecha (docs/28 RV-116).
  const ancha = useAncho() !== 'movil';
  const [accion, setAccion] = useState('');
  // La página va con la búsqueda para la que se eligió: otra búsqueda (también volver a la de antes)
  // empieza en la primera, sin pedir antes una página fuera de rango (docs/31 RV-166). Se ajusta
  // durante el render, como recomienda React, para que la primera carga ya sea la de la página 0. La
  // acción vuelve a 0 en su onChange.
  const [pagina, setPagina] = useState({ n: 0, busqueda });
  if (pagina.busqueda !== busqueda) setPagina({ n: 0, busqueda });
  const n = pagina.busqueda === busqueda ? pagina.n : 0;
  const setN = (i: number) => setPagina({ n: i, busqueda });
  const carga = useCarga(() => cargarRegistro(accion, busqueda, n), [accion, busqueda, n]);
  const filas = carga.datos?.filas ?? [];
  const total = carga.datos?.total ?? filas.length;
  const paginasTotales = paginas(total);
  const acciones = useMemo(() => Object.entries(NOMBRE_ACCION).sort((a, b) => a[1].localeCompare(b[1], 'es')), []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-linea bg-fondo flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm">
        <span className="text-texto-suave">{T.panelCola.filtrar}</span>
        <select
          aria-label={T.panelRegistro.filtroAccion}
          value={accion}
          onChange={(e) => {
            setAccion(e.target.value);
            setN(0);
          }}
          className="border-linea bg-papel rounded-campo min-h-9 border px-2"
        >
          <option value="">{T.panelRegistro.todasAcciones}</option>
          {acciones.map(([clave, nombre]) => (
            <option key={clave} value={clave}>
              {nombre}
            </option>
          ))}
        </select>
        <span className="text-texto-suave ml-auto">{T.panelRegistro.entradas(total)}</span>
        <span className="text-texto-suave">{T.panelRegistro.inmutable}</span>
      </div>

      {carga.estado === 'error' && !filas.length ? (
        <ErrorCarga codigo={carga.codigo} alReintentar={() => void carga.recargar()} />
      ) : carga.estado === 'cargando' && !filas.length ? (
        <p className="text-texto-suave p-6 text-sm">{T.panelCola.cargando}</p>
      ) : !filas.length ? (
        <p className="text-texto-suave p-6 text-center text-sm">
          {busqueda.trim() ? T.panelCola.busquedaVacia(busqueda.trim()) : T.panelRegistro.vacio}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          {/* Falló la última carga y se ven las filas de antes: se dice, para que no pasen por el
              resultado de la búsqueda o del filtro (docs/31 RV-166). */}
          {carga.estado === 'error' && (
            <div
              role="alert"
              className="bg-tinte-oro border-oro-600 text-tinte-oro-texto flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 text-[13px]"
            >
              <span className="min-w-0 flex-1">{T.panelRegistro.errorConFilas(textoError(carga.codigo))}</span>
              <Boton variante="secundario" onClick={() => void carga.recargar()}>
                {T.mapa.reintentar}
              </Boton>
            </div>
          )}
          {!ancha ? (
            <FilasApiladas nombre={T.panelCola.registro} columnas={COLUMNAS}>
              {filas.map((e) => (
                <FilaApilada key={e.id}>
                  <div role="cell">
                    {fechaCorta(e.momento)}
                    <span className="text-texto-suave"> · {hace(e.momento)}</span>
                  </div>
                  <div role="cell" className="[overflow-wrap:anywhere]">
                    {e.actor}
                    {e.es_admin && <span className="text-texto-suave"> · {T.navegacion.jefatura}</span>}
                  </div>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <div role="cell" className="font-semibold">
                      {nombreAccion(e.accion)}
                    </div>
                    <Dato etiqueta={T.panelRegistro.colPunto}>
                      <span className="font-datos">{e.codigo ?? '—'}</span>
                    </Dato>
                  </div>
                  <div role="cell" className="text-texto-suave [overflow-wrap:anywhere]">
                    {detalleLegible(e)}
                  </div>
                </FilaApilada>
              ))}
            </FilasApiladas>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  {COLUMNAS.map((c) => (
                    <th
                      key={c}
                      scope="col"
                      className="border-barra bg-fondo font-titulo text-texto-suave sticky top-0 border-b-2 px-3 py-2 text-left font-semibold"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((e) => (
                  <tr key={e.id} className="border-linea bg-papel border-b">
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {fechaCorta(e.momento)}
                      <span className="text-texto-suave"> · {hace(e.momento)}</span>
                    </td>
                    <td className="px-3 py-1.5">
                      {e.actor}
                      {e.es_admin && <span className="text-texto-suave"> · {T.navegacion.jefatura}</span>}
                    </td>
                    <td className="px-3 py-1.5 font-semibold">{nombreAccion(e.accion)}</td>
                    <td className="font-datos px-3 py-1.5 whitespace-nowrap">{e.codigo ?? '—'}</td>
                    <td className="text-texto-suave px-3 py-1.5">{detalleLegible(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {paginasTotales > 1 && (
            <nav aria-label={T.panelInventario.paginas} className="flex flex-wrap gap-1 px-3 py-2">
              {Array.from({ length: paginasTotales }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-current={i === n || undefined}
                  onClick={() => setN(i)}
                  className={cn(
                    'border-linea min-h-8 min-w-8 rounded border px-2 text-[13px]',
                    i === n ? 'bg-barra border-barra text-white' : 'bg-papel',
                  )}
                >
                  {i + 1}
                </button>
              ))}
            </nav>
          )}
          <p className="text-texto-suave px-3 pb-2 text-[13px]">{T.panelRegistro.porPagina(POR_PAGINA)}</p>
        </div>
      )}
    </div>
  );
}
