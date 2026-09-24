import { useEffect, useState } from 'react';
import { Dialogo } from './Dialogo';
import { ErrorCarga } from './piezas';
import { usePanel } from './usar-panel';
import { Boton } from '@/componentes/Boton';
import { useCarga } from '@/hooks/carga';
import { nombreTipo } from '@/lib/ficha';
import { fechaCorta } from '@/lib/formato';
import { textoError } from '@/lib/panel/errores';
import {
  DIAS_PAPELERA_POR_DEFECTO,
  cargarPapelera,
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-linea bg-fondo flex flex-wrap items-center gap-3 border-b px-3 py-2 text-sm">
        <span>{T.panelPapelera.explicacion(dias)}</span>
        <button
          type="button"
          onClick={() => setPurga(true)}
          disabled={ocupado || !filas.length}
          className="border-linea bg-papel rounded-campo min-h-9 border px-3 text-[13px] font-semibold disabled:opacity-50"
        >
          {T.panelPapelera.purgarCaducado}
        </button>
      </div>

      {!filas.length ? (
        <p className="text-texto-suave p-6 text-center text-sm">
          {carga.estado === 'cargando' ? T.panelCola.cargando : T.panelPapelera.vacia}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-[13px]">
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
                    {fechaCorta(p.borrado_en)}
                    <span className="text-texto-suave">
                      {' '}
                      · {T.panelPapelera.quedan(diasQueQuedan(p.borrado_en, dias))}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <Boton
                      variante="secundario"
                      disabled={ocupado}
                      className="min-h-9 text-[13px]"
                      onClick={() => void restaurar(p.id, p.codigo)}
                    >
                      {T.panel.restaurar}
                    </Boton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
