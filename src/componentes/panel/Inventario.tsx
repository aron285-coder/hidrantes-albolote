import { useMemo, useState } from 'react';
import { DialogoEditar, DialogoHistorial, DialogoMotivo } from './dialogos';
import { usePanel } from './usar-panel';
import { MapaLeaflet } from '@/componentes/mapa/MapaLeaflet';
import { useModo, usePosicion, usePuntos } from '@/hooks/estado';
import { claseChip, nombreCaudal, nombreRacor, nombreTipo } from '@/lib/ficha';
import { fechaCorta, hace } from '@/lib/formato';
import { type Formato, exportar } from '@/lib/panel/exportar';
import { textoError } from '@/lib/panel/errores';
import {
  type Columna,
  type Orden,
  editarPunto,
  inventario,
  nucleosDe,
  ordenarPor,
  pagina,
  paginas,
} from '@/lib/panel/inventario';
import { type Filtro, type Punto } from '@/lib/puntos';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

const FILTROS: { valor: Filtro; nombre: string }[] = [
  { valor: 'todos', nombre: T.mapa.todos },
  { valor: 'hidrantes', nombre: T.mapa.hidrantes },
  { valor: 'bocas', nombre: T.panelInventario.bocasDeRiego },
  { valor: 'no_funciona', nombre: T.mapa.noFunciona },
  { valor: 'sin_revisar', nombre: T.mapa.sinRevisar },
];

const COLUMNAS: { clave: Columna; nombre: string }[] = [
  { clave: 'codigo', nombre: T.panelInventario.colCodigo },
  { clave: 'tipo', nombre: T.panelInventario.colTipo },
  { clave: 'diametro_mm', nombre: T.panelInventario.colDiametro },
  { clave: 'caudal', nombre: T.panelInventario.colEstado },
  { clave: 'direccion', nombre: T.ficha.direccion },
  { clave: 'nucleo', nombre: T.panelInventario.colNucleo },
  { clave: 'fecha_ultima_revision', nombre: T.panelInventario.colRevision },
];

type Dialogo = { punto: Punto; que: 'editar' | 'retirar' | 'borrar' | 'historial' } | null;

/** Inventario (FR-120, FL-24): tabla o mapa, con filtros, orden, páginas y acciones de jefatura. */
export default function Inventario() {
  const { busqueda, avisar } = usePanel();
  const { puntos } = usePuntos();
  const modo = useModo();
  const posicion = usePosicion();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [nucleo, setNucleo] = useState('');
  const [diametro, setDiametro] = useState('');
  const [orden, setOrden] = useState<Orden>({ columna: 'codigo', ascendente: true });
  const [n, setN] = useState(0);
  const [mapa, setMapa] = useState(false);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [exportando, setExportando] = useState(false);
  const [seleccion, setSeleccion] = useState<string | null>(null);

  const nucleos = useMemo(() => nucleosDe(puntos), [puntos]);
  const filtrados = useMemo(
    () => ordenarPor(inventario(puntos, { filtro, nucleo, diametro, busqueda }), orden),
    [puntos, filtro, nucleo, diametro, busqueda, orden],
  );
  const total = paginas(filtrados.length);
  const pag = Math.min(n, total - 1);
  const visibles = pagina(filtrados, pag);

  function ordenarCon(columna: Columna) {
    setOrden((o) => ({ columna, ascendente: o.columna === columna ? !o.ascendente : true }));
    setN(0);
  }

  async function guardarDireccion(p: Punto, valor: string) {
    if ((valor.trim() || null) === p.direccion) return;
    const r = await editarPunto(p.id, { direccion: valor.trim() || null });
    if (!r.ok) return avisar(textoError(r.codigo), 'error');
    avisar(T.panelInventario.guardado(p.codigo));
  }

  async function exportarCon(formato: Formato) {
    setExportando(true);
    // El servidor filtra lo que entiende (05 §6.2); el resto ya está aplicado en pantalla.
    const r = await exportar(formato, {
      ...(filtro === 'hidrantes' ? { tipo: 'hidrante' as const } : {}),
      ...(filtro === 'bocas' ? { tipo: 'boca_riego' as const } : {}),
      ...(filtro === 'no_funciona' ? { caudal: 'no_funciona' as const } : {}),
      ...(filtro === 'sin_revisar' ? { revision_caducada: true } : {}),
      ...(nucleo ? { nucleo } : {}),
      ...(diametro ? { diametro_mm: Number(diametro) } : {}),
    });
    setExportando(false);
    if (!r.ok) return avisar(textoError(r.codigo), 'error');
    avisar(T.panelInventario.exportado(r.datos));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-linea bg-fondo flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm">
        <div role="radiogroup" aria-label={T.mapa.filtrar} className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              type="button"
              role="radio"
              aria-checked={filtro === f.valor}
              onClick={() => {
                setFiltro(f.valor);
                setN(0);
              }}
              className={cn(
                'border-linea min-h-9 rounded-full border px-3 text-[13px]',
                filtro === f.valor ? 'bg-barra border-barra text-white' : 'bg-papel text-texto-suave',
              )}
            >
              {f.nombre}
            </button>
          ))}
        </div>
        <select
          aria-label={T.panelCola.filtroNucleo}
          value={nucleo}
          onChange={(e) => {
            setNucleo(e.target.value);
            setN(0);
          }}
          className="border-linea bg-papel rounded-campo min-h-9 border px-2"
        >
          <option value="">{T.panelCola.todosNucleos}</option>
          {nucleos.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select
          aria-label={T.panelInventario.filtroDiametro}
          value={diametro}
          onChange={(e) => {
            setDiametro(e.target.value);
            setN(0);
          }}
          className="border-linea bg-papel rounded-campo min-h-9 border px-2"
        >
          <option value="">{T.panelInventario.cualquierDiametro}</option>
          {[45, 70, 100].map((d) => (
            <option key={d} value={d}>
              {T.formato.mm(d)}
            </option>
          ))}
        </select>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-texto-suave">{T.panel.exportar}</span>
          {(['xlsx', 'csv', 'geojson'] as Formato[]).map((f) => (
            <button
              key={f}
              type="button"
              disabled={exportando || !filtrados.length}
              onClick={() => void exportarCon(f)}
              className="border-linea bg-papel rounded-campo min-h-9 border px-3 text-[13px] font-semibold disabled:opacity-50"
            >
              {f === 'xlsx' ? T.panel.excel : f === 'csv' ? T.panel.csv : T.panel.geojson}
            </button>
          ))}
          <div role="radiogroup" aria-label={T.panelInventario.vista} className="flex gap-1.5">
            {[false, true].map((esMapa) => (
              <button
                key={String(esMapa)}
                type="button"
                role="radio"
                aria-checked={mapa === esMapa}
                onClick={() => setMapa(esMapa)}
                className={cn(
                  'border-linea min-h-9 rounded-full border px-3 text-[13px]',
                  mapa === esMapa ? 'bg-barra border-barra text-white' : 'bg-papel text-texto-suave',
                )}
              >
                {esMapa ? T.panelInventario.mapa : T.panelInventario.tabla}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!filtrados.length ? (
        <p className="text-texto-suave p-6 text-center text-sm">
          {busqueda.trim() ? T.panelCola.busquedaVacia(busqueda.trim()) : T.panelInventario.vacio}
        </p>
      ) : mapa ? (
        <div className="relative isolate min-h-[60vh] flex-1">
          <MapaLeaflet
            puntos={filtrados}
            seleccionado={seleccion}
            capa="base"
            modo={modo}
            posicion={posicion.tipo === 'ok' ? posicion.posicion : null}
            alSeleccionar={setSeleccion}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                {COLUMNAS.map((c) => (
                  <th key={c.clave} scope="col" className="border-barra bg-fondo sticky top-0 border-b-2 p-0 text-left">
                    <button
                      type="button"
                      onClick={() => ordenarCon(c.clave)}
                      aria-label={T.panelInventario.ordenarPor(c.nombre)}
                      className="font-titulo text-texto-suave flex min-h-9 w-full items-center gap-1 px-3 font-semibold"
                    >
                      {c.nombre}
                      {orden.columna === c.clave && <span aria-hidden>{orden.ascendente ? '▲' : '▼'}</span>}
                    </button>
                  </th>
                ))}
                <th
                  scope="col"
                  className="border-barra bg-fondo font-titulo text-texto-suave sticky top-0 border-b-2 px-3 py-2 text-left font-semibold"
                >
                  {T.panelInventario.colAcciones}
                </th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.id} className="border-linea bg-papel border-b">
                  <td className="font-datos px-3 py-1.5 whitespace-nowrap">{p.codigo}</td>
                  <td className="px-3 py-1.5">{nombreTipo[p.tipo]}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {T.formato.mm(p.diametro_mm)}
                    {p.racor && <span className="text-texto-suave"> · {nombreRacor(p.racor)}</span>}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={cn('rounded-chip px-2 py-0.5 text-[12px] font-semibold', claseChip[p.caudal])}>
                      {nombreCaudal[p.caudal]}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      defaultValue={p.direccion ?? ''}
                      placeholder={T.panel.pendienteEscribe}
                      aria-label={T.panelInventario.direccionDe(p.codigo)}
                      onBlur={(e) => void guardarDireccion(p, e.target.value)}
                      className="border-linea rounded-campo min-h-8 w-full border border-transparent bg-transparent px-1 hover:border-[var(--linea)] focus:border-[var(--linea)]"
                    />
                  </td>
                  <td className="px-3 py-1.5">{p.nucleo ?? T.panelCola.sinNucleo}</td>
                  <td
                    className={cn(
                      'px-3 py-1.5 whitespace-nowrap',
                      p.revision_caducada && 'text-rojo-700 font-semibold',
                    )}
                  >
                    {hace(p.fecha_ultima_revision)}
                    <span className="text-texto-suave"> · {fechaCorta(p.fecha_ultima_revision)}</span>
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {(['editar', 'retirar', 'historial', 'borrar'] as const).map((que) => (
                        <button
                          key={que}
                          type="button"
                          onClick={() => setDialogo({ punto: p, que })}
                          className={cn(
                            'min-h-8 px-2 underline',
                            que === 'borrar' && 'text-rojo-700 ml-3',
                            que === 'historial' && 'text-texto-suave',
                          )}
                        >
                          {que === 'editar'
                            ? T.panel.editar
                            : que === 'retirar'
                              ? T.panel.retirar
                              : que === 'historial'
                                ? T.panel.historial
                                : T.panel.borrar}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="text-texto-suave flex flex-wrap items-center gap-3 px-3 py-2 text-[13px]">
            <span>{T.panel.mostrando(visibles.length, filtrados.length)}</span>
            <span>{T.panelInventario.ayudaTabla}</span>
            {total > 1 && (
              <nav aria-label={T.panelInventario.paginas} className="ml-auto flex gap-1">
                {Array.from({ length: total }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-current={i === pag || undefined}
                    onClick={() => setN(i)}
                    className={cn(
                      'border-linea min-h-8 min-w-8 rounded border px-2',
                      i === pag ? 'bg-barra border-barra text-white' : 'bg-papel',
                    )}
                  >
                    {i + 1}
                  </button>
                ))}
              </nav>
            )}
          </div>
        </div>
      )}

      {dialogo?.que === 'editar' && (
        <DialogoEditar punto={dialogo.punto} alCerrar={() => setDialogo(null)} alHecho={() => setDialogo(null)} />
      )}
      {(dialogo?.que === 'retirar' || dialogo?.que === 'borrar') && (
        <DialogoMotivo
          punto={dialogo.punto}
          accion={dialogo.que}
          alCerrar={() => setDialogo(null)}
          alHecho={() => setDialogo(null)}
        />
      )}
      {dialogo?.que === 'historial' && <DialogoHistorial punto={dialogo.punto} alCerrar={() => setDialogo(null)} />}
    </div>
  );
}
