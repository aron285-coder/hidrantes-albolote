import { useEffect, useId, useState } from 'react';
import { Dialogo } from './Dialogo';
import { ErrorCarga, Fecha } from './piezas';
import { usePanel } from './usar-panel';
import { Boton } from '@/componentes/Boton';
import { usePanelAncho } from '@/hooks/ancho';
import { useCarga } from '@/hooks/carga';
import { nombreTipo } from '@/lib/ficha';
import { textoError } from '@/lib/panel/errores';
import {
  DIAS_PAPELERA_POR_DEFECTO,
  cargarPapelera,
  type Borrado,
  diasQueQuedan,
  leerParametro,
  purgarPapelera,
  restaurarPunto,
} from '@/lib/panel/inventario';
import { T } from '@/lib/textos';

/** Papelera (FR-124, FL-24): lo borrado se conserva unos días y se puede restaurar. */
export default function Papelera({ alCambiar }: { alCambiar: () => void }) {
  const { avisar } = usePanel();
  const carga = useCarga(() => cargarPapelera(), []);
  const [dias, setDias] = useState(DIAS_PAPELERA_POR_DEFECTO);
  useEffect(() => {
    void leerParametro('dias_papelera', DIAS_PAPELERA_POR_DEFECTO).then(setDias);
  }, []);
  const [ocupado, setOcupado] = useState(false);
  const [purga, setPurga] = useState(false);
  const filas = carga.datos ?? [];
  // Desde 1.100 px, la tabla; por debajo, una lista (docs/38 RV-508, DEC-213).
  const ancha = usePanelAncho();
  const idVacia = useId();

  async function restaurar(id: string, codigo: string) {
    setOcupado(true);
    const r = await restaurarPunto(id);
    setOcupado(false);
    if (!r.ok) return avisar(textoError(r.codigo), 'error');
    avisar(T.panelPapelera.restaurado(codigo));
    alCambiar();
    await carga.recargar();
  }

  async function purgar() {
    setOcupado(true);
    const r = await purgarPapelera();
    setOcupado(false);
    setPurga(false);
    if (!r.ok) return avisar(textoError(r.codigo), 'error');
    avisar(T.panelPapelera.purgados(r.datos ?? 0));
    alCambiar();
    await carga.recargar();
  }

  if (carga.estado === 'error' && !filas.length) {
    return <ErrorCarga codigo={carga.codigo} alReintentar={() => void carga.recargar()} />;
  }

  // «Borrado hace… · quedan N días»; con un día, en rojo y negrita (docs/38 RV-508).
  const quedan = (p: Borrado) => {
    const n = diasQueQuedan(p.borrado_en, dias);
    return (
      <span className={n === 1 ? 'font-bold text-rojo-texto' : 'text-texto-suave'}>{T.panelPapelera.quedan(n)}</span>
    );
  };
  const restaurarBoton = (p: Borrado) => (
    <Boton
      variante="secundario"
      disabled={ocupado}
      className="min-h-11 shrink-0 text-[13px] min-[1100px]:min-h-9"
      onClick={() => void restaurar(p.id, p.codigo)}
    >
      {T.panel.restaurar}
    </Boton>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* «Purgar…» en rojo, arriba y apartado de los «Restaurar» de cada fila (docs/38 RV-508). */}
      <div className="border-linea bg-fondo flex flex-wrap items-center gap-3 border-b px-3 py-2 text-sm">
        <span>{T.panelPapelera.explicacion(dias)}</span>
        <button
          type="button"
          onClick={() => setPurga(true)}
          disabled={ocupado || !filas.length}
          aria-describedby={!filas.length ? idVacia : undefined}
          className="border-rojo-texto text-rojo-texto bg-papel rounded-campo min-h-11 border px-3 text-[13px] font-semibold disabled:opacity-50 min-[1100px]:min-h-9"
        >
          {T.panelPapelera.purgarCaducado}
        </button>
      </div>

      {!filas.length ? (
        <p id={idVacia} className="text-texto-suave p-6 text-center text-sm">
          {carga.estado === 'cargando' ? T.panelCola.cargando : T.panelPapelera.vacia}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          {!ancha ? (
            // Por debajo de 1.100 px, una lista (docs/38 RV-508): el código y «Restaurar»; tipo · diámetro; cuándo se borró
            // y cuántos días quedan.
            <ul aria-label={T.panelCola.papelera} className="text-[13px]">
              {filas.map((p) => (
                <li key={p.id} className="border-linea bg-papel flex items-center gap-3 border-b px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-datos font-semibold">{p.codigo}</p>
                    <p className="text-texto-suave mt-0.5">
                      {nombreTipo[p.tipo]} · {T.formato.mm(p.diametro_mm)}
                    </p>
                    <p className="mt-0.5">
                      {T.panelPapelera.colBorrado} <Fecha f={p.borrado_en} className="whitespace-nowrap" /> ·{' '}
                      {quedan(p)}
                    </p>
                  </div>
                  {restaurarBoton(p)}
                </li>
              ))}
            </ul>
          ) : (
            <table className="w-full max-w-[900px] text-[13px]">
              <thead>
                <tr>
                  {[
                    T.panelInventario.colCodigo,
                    T.panelInventario.colTipo,
                    T.panelPapelera.colBorrado,
                    T.panelInventario.colAcciones,
                  ].map((c) => (
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
                {filas.map((p) => (
                  <tr key={p.id} className="border-linea bg-papel border-b">
                    <td className="font-datos px-3 py-1.5 whitespace-nowrap">{p.codigo}</td>
                    <td className="px-3 py-1.5">
                      {nombreTipo[p.tipo]} · {T.formato.mm(p.diametro_mm)}
                    </td>
                    <td className="px-3 py-1.5">
                      <Fecha f={p.borrado_en} /> · {quedan(p)}
                    </td>
                    <td className="px-3 py-1.5">{restaurarBoton(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {purga && (
        <Dialogo titulo={T.panelPapelera.purgarCaducado} alCerrar={() => setPurga(false)}>
          <p className="text-sm">{T.panelPapelera.avisoPurga(dias)}</p>
          <div className="mt-3 flex gap-3">
            <Boton variante="destructivo" disabled={ocupado} onClick={() => void purgar()}>
              {T.panelPapelera.confirmarPurga}
            </Boton>
            <Boton variante="secundario" onClick={() => setPurga(false)}>
              {T.panelCola.cancelar}
            </Boton>
          </div>
        </Dialogo>
      )}
    </div>
  );
}
