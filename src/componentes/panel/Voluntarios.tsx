import { useMemo, useState } from 'react';
import { Dialogo } from './Dialogo';
import { ErrorCarga } from './piezas';
import { usePanel } from './usar-panel';
import { Boton } from '@/componentes/Boton';
import { useCarga } from '@/hooks/carga';
import { fechaCorta, hace } from '@/lib/formato';
import { textoError } from '@/lib/panel/errores';
import {
  type Actividad,
  MESES,
  TASA_BAJA,
  anonimizar,
  cargarActividad,
  cargarIncidencias,
  filtrarActividad,
  porcentaje,
  resolverIncidencia,
} from '@/lib/panel/voluntarios';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

const cabecera =
  'border-barra bg-fondo font-titulo text-texto-suave sticky top-0 border-b-2 px-3 py-2 text-left font-semibold';

/** Voluntarios e incidencias (FR-130–FR-132, FL-27). */
export default function Voluntarios({ alCambiar }: { alCambiar: () => void }) {
  const { busqueda, avisar } = usePanel();
  const [meses, setMeses] = useState(MESES[0]);
  const [aAnonimizar, setAAnonimizar] = useState<Actividad | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const actividad = useCarga(() => cargarActividad(meses), [meses]);
  const incidencias = useCarga(() => cargarIncidencias(), []);
  const filas = useMemo(() => filtrarActividad(actividad.datos ?? [], busqueda), [actividad.datos, busqueda]);
  const avisos = incidencias.datos ?? [];
  const abiertas = avisos.filter((i) => i.estado === 'abierta').length;

  async function confirmarAnonimizar(v: Actividad) {
    setOcupado(true);
    const r = await anonimizar(v.dispositivo_id);
    setOcupado(false);
    setAAnonimizar(null);
    if (!r.ok) return avisar(textoError(r.codigo), 'error');
    avisar(T.panelVoluntarios.anonimizado(r.datos ?? 0));
    await actividad.recargar();
  }

  async function resolver(id: string) {
    setOcupado(true);
    const r = await resolverIncidencia(id);
    setOcupado(false);
    if (!r.ok) return avisar(textoError(r.codigo), 'error');
    avisar(T.panelVoluntarios.incidenciaResuelta);
    alCambiar();
    await incidencias.recargar();
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="border-linea bg-fondo flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-texto-suave">{T.panelVoluntarios.actividadDe}</span>
          <select
            value={meses}
            onChange={(e) => setMeses(Number(e.target.value))}
            className="border-linea bg-papel rounded-campo min-h-9 border px-2"
          >
            {MESES.map((m) => (
              <option key={m} value={m}>
                {T.panelVoluntarios.meses(m)}
              </option>
            ))}
          </select>
        </label>
        <span className="text-texto-suave ml-auto">{T.panelVoluntarios.soloAqui}</span>
      </div>

      {actividad.estado === 'error' && !filas.length ? (
        <ErrorCarga codigo={actividad.codigo} alReintentar={() => void actividad.recargar()} />
      ) : !filas.length ? (
        <p className="text-texto-suave p-6 text-center text-sm">
          {actividad.estado === 'cargando' ? T.panelCola.cargando : T.panelVoluntarios.vacio}
        </p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              {[
                T.panelVoluntarios.colVoluntario,
                T.panelVoluntarios.colPropuestas,
                T.panelVoluntarios.colAprobadas,
                T.panelVoluntarios.colRechazadas,
                T.panelVoluntarios.colTasa,
                T.panelVoluntarios.colUltima,
                T.panelInventario.colAcciones,
              ].map((c) => (
                <th key={c} scope="col" className={cabecera}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((v) => {
              const tasa = porcentaje(v.tasa);
              return (
                <tr key={v.dispositivo_id} className="border-linea bg-papel border-b">
                  <td className="px-3 py-1.5">{v.autor}</td>
                  <td className="px-3 py-1.5">{v.propuestas}</td>
                  <td className="px-3 py-1.5">{v.aprobadas}</td>
                  <td className="px-3 py-1.5">{v.rechazadas}</td>
                  <td className="px-3 py-1.5">
                    {tasa == null ? (
                      <span className="text-texto-suave">{T.panelVoluntarios.sinResolver}</span>
                    ) : (
                      <>
                        <span
                          className={cn(
                            'rounded-chip px-2 py-0.5 font-semibold',
                            tasa >= TASA_BAJA ? 'bg-verde-100 text-verde-600' : 'bg-rojo-100 text-rojo-700',
                          )}
                        >
                          {T.panelVoluntarios.porcentaje(tasa)}
                        </span>
                        {tasa < TASA_BAJA && (
                          <span className="text-texto-suave"> · {T.panelVoluntarios.convieneHablar}</span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {hace(v.ultima)}
                    <span className="text-texto-suave"> · {fechaCorta(v.ultima)}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => setAAnonimizar(v)}
                      className="text-texto-suave min-h-8 px-2 underline"
                    >
                      {T.panel.anonimizar}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="border-linea bg-fondo mt-4 flex flex-wrap items-center gap-2 border-y px-3 py-2 text-sm">
        <h2 className="font-titulo font-semibold">{T.panelVoluntarios.incidencias}</h2>
        <span className="text-texto-suave">{T.panelVoluntarios.deAlgoNoFunciona}</span>
        <span className="text-texto-suave ml-auto">{T.panelVoluntarios.abiertas(abiertas)}</span>
      </div>

      {incidencias.estado === 'error' && !avisos.length ? (
        <ErrorCarga codigo={incidencias.codigo} alReintentar={() => void incidencias.recargar()} />
      ) : !avisos.length ? (
        <p className="text-texto-suave p-6 text-center text-sm">
          {incidencias.estado === 'cargando' ? T.panelCola.cargando : T.panelVoluntarios.sinIncidencias}
        </p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              {[
                T.panelVoluntarios.colCuando,
                T.panelVoluntarios.colVersion,
                T.panelVoluntarios.colDescripcion,
                T.panelCola.campoEstado,
                T.panelInventario.colAcciones,
              ].map((c) => (
                <th key={c} scope="col" className={cabecera}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {avisos.map((i) => (
              <tr key={i.id} className="border-linea bg-papel border-b">
                <td className="px-3 py-1.5 whitespace-nowrap">{fechaCorta(i.momento)}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {i.version_app ?? '—'}
                  {i.ruta && <span className="text-texto-suave"> · {i.ruta}</span>}
                </td>
                <td className="px-3 py-1.5">{i.descripcion}</td>
                <td className="px-3 py-1.5">
                  <span
                    className={cn(
                      'rounded-chip px-2 py-0.5 font-semibold',
                      i.estado === 'abierta' ? 'bg-ambar-100 text-ambar-700' : 'bg-verde-100 text-verde-600',
                    )}
                  >
                    {i.estado === 'abierta' ? T.panelVoluntarios.abierta : T.panelVoluntarios.resuelta}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  {i.estado === 'abierta' ? (
                    <Boton
                      className="bg-verde-600 min-h-9 text-[13px]"
                      disabled={ocupado}
                      onClick={() => void resolver(i.id)}
                    >
                      {T.panel.marcarResuelta}
                    </Boton>
                  ) : (
                    <span className="text-texto-suave">
                      {T.panelVoluntarios.resueltaPor(
                        i.resuelta_por ?? '—',
                        i.resuelta_en ? fechaCorta(i.resuelta_en) : '—',
                      )}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {aAnonimizar && (
        <Dialogo titulo={T.panel.anonimizar} alCerrar={() => setAAnonimizar(null)}>
          <p className="text-sm">{T.panelVoluntarios.avisoAnonimizar(aAnonimizar.autor)}</p>
          <div className="mt-3 flex gap-3">
            <Boton variante="destructivo" disabled={ocupado} onClick={() => void confirmarAnonimizar(aAnonimizar)}>
              {T.panelVoluntarios.confirmarAnonimizar}
            </Boton>
            <Boton variante="secundario" onClick={() => setAAnonimizar(null)}>
              {T.panelCola.cancelar}
            </Boton>
          </div>
        </Dialogo>
      )}
    </div>
  );
}
