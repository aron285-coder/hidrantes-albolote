import { useMemo, useState } from 'react';
import { DialogoEditar, DialogoHistorial, DialogoMotivo } from './dialogos';
import { usePanel } from './usar-panel';
import { MapaLeaflet } from '@/componentes/mapa/MapaLeaflet';
import { usePanelAncho } from '@/hooks/ancho';
import { useModo, usePosicion, usePuntos } from '@/hooks/estado';
import { claseChip, nombreCaudal, nombreRacor, nombreTipo } from '@/lib/ficha';
import { fechaCorta, hace } from '@/lib/formato';
import { type Formato, exportar } from '@/lib/panel/exportar';
import { textoError } from '@/lib/panel/errores';
import {
  type Columna,
  type FiltrosInventario,
  type Orden,
  editarPunto,
  filtrosExportacion,
  inventario,
  nucleosDe,
  ordenarPor,
  pagina,
  paginas,
} from '@/lib/panel/inventario';
import { type Punto } from '@/lib/puntos';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

// FR-120: tipo, estado y revisión son tres controles independientes, combinables (RV-24).
const TIPOS: { valor: FiltrosInventario['tipo']; nombre: string }[] = [
  { valor: 'todos', nombre: T.mapa.todos },
  { valor: 'hidrante', nombre: T.mapa.hidrantes },
  { valor: 'boca_riego', nombre: T.panelInventario.bocasDeRiego },
];
const ESTADOS: { valor: FiltrosInventario['caudal']; nombre: string }[] = [
  { valor: 'todos', nombre: T.mapa.todos },
  { valor: 'bueno', nombre: T.formulario.bueno },
  { valor: 'regular', nombre: T.formulario.regular },
  { valor: 'malo', nombre: T.formulario.malo },
  { valor: 'no_funciona', nombre: T.formulario.noFunciona },
];
const REVISIONES: { valor: 'todas' | 'sin_revisar'; nombre: string }[] = [
  { valor: 'todas', nombre: T.panelInventario.todas },
  { valor: 'sin_revisar', nombre: T.mapa.sinRevisar },
];

function Chips<V extends string>({
  etiqueta,
  opciones,
  valor,
  alCambiar,
}: {
  etiqueta: string;
  opciones: { valor: V; nombre: string }[];
  valor: V;
  alCambiar: (v: V) => void;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex flex-wrap items-center gap-1.5">
      <span className="text-texto-suave text-[12px]">{etiqueta}</span>
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => alCambiar(o.valor)}
          className={cn(
            'border-linea min-h-9 rounded-full border px-3 text-[13px]',
            valor === o.valor ? 'bg-barra border-barra text-white' : 'bg-papel text-texto-suave',
          )}
        >
          {o.nombre}
        </button>
      ))}
    </div>
  );
}

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
  const ancha = usePanelAncho();
  const [tipo, setTipo] = useState<FiltrosInventario['tipo']>('todos');
  const [caudal, setCaudal] = useState<FiltrosInventario['caudal']>('todos');
  const [sinRevisar, setSinRevisar] = useState(false);
  const [nucleo, setNucleo] = useState('');
  const [diametro, setDiametro] = useState('');
  const [orden, setOrden] = useState<Orden>({ columna: 'codigo', ascendente: true });
  const [n, setN] = useState(0);
  const [mapa, setMapa] = useState(false);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [exportando, setExportando] = useState(false);
  const [seleccion, setSeleccion] = useState<string | null>(null);

  const nucleos = useMemo(() => nucleosDe(puntos), [puntos]);
  const filtros: FiltrosInventario = { tipo, caudal, sin_revisar: sinRevisar, nucleo, diametro, busqueda };
  const filtrados = useMemo(
    () => ordenarPor(inventario(puntos, filtros), orden),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [puntos, tipo, caudal, sinRevisar, nucleo, diametro, busqueda, orden],
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
    // El servidor filtra lo que entiende (05 §6.2); la búsqueda no la conoce, así que con búsqueda
    // el archivo lleva solo lo que se ve en la tabla (FR-160, RV-24).
    const r = await exportar(
      formato,
      filtrosExportacion(filtros),
      busqueda.trim() ? filtrados.map((p) => p.codigo) : undefined,
    );
    setExportando(false);
    if (!r.ok) return avisar(textoError(r.codigo), 'error');
    avisar(T.panelInventario.exportado(r.datos));
  }

  // Piezas de cada punto, iguales en la tabla y en las filas de dos líneas (docs/20 RV-79).
  const diametroDe = (p: Punto) => (
    <>
      {T.formato.mm(p.diametro_mm)}
      {p.racor && <span className="text-texto-suave"> · {nombreRacor(p.racor)}</span>}
    </>
  );
  const estadoDe = (p: Punto) => (
    <span className={cn('rounded-chip px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap', claseChip[p.caudal])}>
      {nombreCaudal[p.caudal]}
    </span>
  );
  // Nunca "— pen": el campo mide al menos lo que su texto de "pendiente" (RV-79).
  const direccionDe = (p: Punto, clase?: string) => (
    <input
      defaultValue={p.direccion ?? ''}
      placeholder={T.panel.pendienteEscribe}
      aria-label={T.panelInventario.direccionDe(p.codigo)}
      onBlur={(e) => void guardarDireccion(p, e.target.value)}
      className={cn(
        'border-linea rounded-campo min-h-8 w-full min-w-[27ch] border border-transparent bg-transparent px-1 hover:border-[var(--linea)] focus:border-[var(--linea)]',
        clase,
      )}
    />
  );
  const revisionDe = (p: Punto) => (
    <span className={cn('whitespace-nowrap', p.revision_caducada && 'text-rojo-700 font-semibold')}>
      {hace(p.fecha_ultima_revision)}
      <span className="text-texto-suave font-normal"> · {fechaCorta(p.fecha_ultima_revision)}</span>
    </span>
  );
  const accionesDe = (p: Punto) => (
    <div className="flex flex-wrap items-center gap-1">
      {(['editar', 'retirar', 'historial', 'borrar'] as const).map((que) => (
        <button
          key={que}
          type="button"
          onClick={() => setDialogo({ punto: p, que })}
          className={cn(
            'min-h-8 px-2 whitespace-nowrap underline',
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
  );
  const botonOrden = (c: (typeof COLUMNAS)[number], clase: string) => (
    <button
      type="button"
      onClick={() => ordenarCon(c.clave)}
      aria-label={T.panelInventario.ordenarPor(c.nombre)}
      className={cn('font-titulo text-texto-suave flex min-h-9 items-center gap-1 px-3 font-semibold', clase)}
    >
      {c.nombre}
      {orden.columna === c.clave && <span aria-hidden>{orden.ascendente ? '▲' : '▼'}</span>}
    </button>
  );

  const tabla = (
    <table className="w-full text-[13px]">
      <thead>
        <tr>
          {COLUMNAS.map((c) => (
            <th key={c.clave} scope="col" className="border-barra bg-fondo sticky top-0 border-b-2 p-0 text-left">
              {botonOrden(c, 'w-full')}
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
            <td className="px-3 py-1.5 whitespace-nowrap">{nombreTipo[p.tipo]}</td>
            <td className="px-3 py-1.5 whitespace-nowrap">{diametroDe(p)}</td>
            <td className="px-3 py-1.5">{estadoDe(p)}</td>
            <td className="px-3 py-1.5">{direccionDe(p)}</td>
            <td className="px-3 py-1.5">{p.nucleo ?? T.panelCola.sinNucleo}</td>
            <td className="px-3 py-1.5">{revisionDe(p)}</td>
            <td className="px-3 py-1.5">{accionesDe(p)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  // Por debajo de 1.024 px: código, tipo, diámetro y estado en la primera línea; dirección, núcleo y
  // última revisión en la segunda. El orden, con los mismos botones que las cabeceras de la tabla.
  // Misma tabla para los lectores de pantalla (filas y celdas), en dos líneas a la vista.
  const filas = (
    <div role="table" aria-label={T.panelCola.inventario} className="text-[13px]">
      <div role="row" className="border-barra bg-fondo sticky top-0 z-10 flex flex-wrap items-center border-b-2 px-1">
        {COLUMNAS.map((c) => (
          <span key={c.clave} role="columnheader">
            {botonOrden(c, '')}
          </span>
        ))}
      </div>
      {visibles.map((p) => (
        <div key={p.id} role="row" className="border-linea bg-papel border-b px-3 py-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span role="cell" className="font-datos font-semibold whitespace-nowrap">
              {p.codigo}
            </span>
            <span role="cell" className="whitespace-nowrap">
              {nombreTipo[p.tipo]}
            </span>
            <span role="cell" className="whitespace-nowrap">
              {diametroDe(p)}
            </span>
            <span role="cell">{estadoDe(p)}</span>
            <span role="cell" className="ml-auto">
              {accionesDe(p)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span role="cell" className="flex min-w-0 flex-1 basis-[27ch]">
              {direccionDe(p)}
            </span>
            <span role="cell" className="whitespace-nowrap">
              {p.nucleo ?? T.panelCola.sinNucleo}
            </span>
            <span role="cell">{revisionDe(p)}</span>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-linea bg-fondo flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm">
        <Chips
          etiqueta={T.panelInventario.colTipo}
          opciones={TIPOS}
          valor={tipo}
          alCambiar={(v) => {
            setTipo(v);
            setN(0);
          }}
        />
        <Chips
          etiqueta={T.panelInventario.colEstado}
          opciones={ESTADOS}
          valor={caudal}
          alCambiar={(v) => {
            setCaudal(v);
            setN(0);
          }}
        />
        <Chips
          etiqueta={T.panelInventario.filtroRevision}
          opciones={REVISIONES}
          valor={sinRevisar ? 'sin_revisar' : 'todas'}
          alCambiar={(v) => {
            setSinRevisar(v === 'sin_revisar');
            setN(0);
          }}
        />
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
          {ancha ? tabla : filas}

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
