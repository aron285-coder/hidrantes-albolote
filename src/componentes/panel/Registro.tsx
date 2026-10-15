import { useMemo, useState } from 'react';
import { Filtros } from './Filtros';
import { ErrorCarga, EtiquetaPequena, Fecha } from './piezas';
import { usePanel } from './usar-panel';
import { Boton } from '@/componentes/Boton';
import { usePanelAncho, usePanelMovil } from '@/hooks/ancho';
import { useCarga } from '@/hooks/carga';
import { useAcceso } from '@/hooks/estado';
import { esUnoMismo } from '@/lib/panel/ajustes';
import {
  type EntradaRegistro,
  NOMBRE_ACCION,
  POR_PAGINA,
  cargarRegistro,
  nombreAccion,
  paginas,
} from '@/lib/panel/inventario';
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
  // Desde 1.100 px, la tabla; por debajo, una lista de tres líneas (docs/38 RV-507, DEC-213).
  const ancha = usePanelAncho();
  const movil = usePanelMovil();
  const acceso = useAcceso();
  const propio = acceso.tipo === 'jefatura' ? acceso.correo : null;
  const [accion, setAccion] = useState('');
  // La página va con la búsqueda para la que se eligió: otra búsqueda (también volver a la de antes)
  // empieza en la primera, sin pedir antes una página fuera de rango (docs/31 RV-166). Se ajusta
  // durante el render, como recomienda React, para que la primera carga ya sea la de la página 0. La
  // acción vuelve a 0 al cambiarla.
  const [pagina, setPagina] = useState({ n: 0, busqueda });
  if (pagina.busqueda !== busqueda) setPagina({ n: 0, busqueda });
  const n = pagina.busqueda === busqueda ? pagina.n : 0;
  const setN = (i: number) => setPagina({ n: i, busqueda });
  const carga = useCarga(() => cargarRegistro(accion, busqueda, n), [accion, busqueda, n]);
  const filas = carga.datos?.filas ?? [];
  const total = carga.datos?.total ?? filas.length;
  const paginasTotales = paginas(total);
  const acciones = useMemo(() => Object.entries(NOMBRE_ACCION).sort((a, b) => a[1].localeCompare(b[1], 'es')), []);
  const elegir = (v: string) => {
    setAccion(v);
    setN(0);
  };

  // Quién: «Tú» si es el propio administrador (DEC-215); si no, el correo o el nombre.
  const quien = (e: EntradaRegistro) => (esUnoMismo(e.actor, propio) ? T.panel.tu : e.actor);
  const jefatura = (e: EntradaRegistro) =>
    e.es_admin && (
      <>
        {' '}
        <EtiquetaPequena tono="azul">{T.navegacion.jefatura}</EtiquetaPequena>
      </>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* El botón de filtros (UI-19, DEC-214) y, a la derecha (en el móvil, debajo), cuántas entradas hay. */}
      <div className="border-linea bg-fondo flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 text-sm">
        <Filtros
          titulo={T.panelRegistro.filtroAccion}
          resumen={accion ? nombreAccion(accion) : T.panelRegistro.todasAcciones}
          activo={!!accion}
          lleno={movil}
          alQuitar={() => elegir('')}
          grupos={[
            {
              titulo: T.panelRegistro.colAccion,
              forma: 'lista',
              valor: accion,
              alCambiar: elegir,
              opciones: [
                { valor: '', nombre: T.panelRegistro.todasAcciones },
                ...acciones.map(([clave, nombre]) => ({ valor: clave, nombre })),
              ],
            },
          ]}
        />
        <span className="text-texto-suave max-md:basis-full md:ml-auto">
          {T.panelRegistro.entradas(total)} · {T.panelRegistro.inmutable}
        </span>
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
            // Por debajo de 1.100 px, una lista de tres líneas por entrada (docs/38 RV-507): la acción y el punto; el
            // detalle, partiendo donde haga falta (UI-17); quién y cuándo.
            <ul aria-label={T.panelCola.registro} className="text-[13px]">
              {filas.map((e) => (
                <li key={e.id} className="border-linea bg-papel border-b px-3 py-2">
                  <p className="flex items-baseline gap-2">
                    <span className="flex-1 font-semibold">{nombreAccion(e.accion)}</span>
                    {e.codigo && <span className="font-datos shrink-0">{e.codigo}</span>}
                  </p>
                  <p className="text-texto-suave mt-0.5 [overflow-wrap:anywhere]">{detalleLegible(e)}</p>
                  <p className="text-texto-suave mt-0.5 [overflow-wrap:anywhere]">
                    {quien(e)}
                    {jefatura(e)} · <Fecha f={e.momento} className="whitespace-nowrap" />
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <table className="w-full text-[13px] min-[1600px]:max-w-[1500px]">
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
                      <Fecha f={e.momento} />
                    </td>
                    <td className="px-3 py-1.5 [overflow-wrap:anywhere]">
                      {quien(e)}
                      {jefatura(e)}
                    </td>
                    <td className="px-3 py-1.5 font-semibold">{nombreAccion(e.accion)}</td>
                    <td className="font-datos px-3 py-1.5 whitespace-nowrap">{e.codigo ?? ''}</td>
                    <td className="text-texto-suave px-3 py-1.5 [overflow-wrap:anywhere]">{detalleLegible(e)}</td>
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
                    'border-linea min-h-11 min-w-11 rounded border px-2 text-[13px] min-[1100px]:min-h-8 min-[1100px]:min-w-8',
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
