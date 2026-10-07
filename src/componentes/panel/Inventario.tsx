import { ChevronDown } from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DialogoHistorial, DialogoMotivo } from './dialogos';
import { ConfirmarDescartar, type EstadoEditar } from './descartar';

// Editar en su propia porción: ver descartar.tsx (RV-80).
const EditarPunto = lazy(() => import('./EditarPunto'));
import { usePanel } from './usar-panel';
import { MapaLeaflet } from '@/componentes/mapa/MapaLeaflet';
import { usePanelAncho } from '@/hooks/ancho';
import { useModo, usePosicion, usePuntos } from '@/hooks/estado';
import { claseChip, nombreCaudal, nombreRacor, nombreTipo } from '@/lib/ficha';
import { fechaCorta, hace } from '@/lib/formato';
import { type Formato, exportar } from '@/lib/panel/exportar';
import { quitarEntradaDeEditar } from '@/lib/panel/historial-editar';
import { anotarError } from '@/lib/errores';
import { textoError } from '@/lib/panel/errores';
import {
  type Columna,
  type FiltrosInventario,
  type Orden,
  cuentaPorEstado,
  editarPunto,
  filtrosExportacion,
  inventario,
  ordenarPor,
  pagina,
  paginas,
} from '@/lib/panel/inventario';
import { type Punto } from '@/lib/puntos';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

// FR-120: Tipo y Estado, dos desplegables independientes y combinables (docs/29 RV-123, DEC-168).
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
  { valor: 'barro', nombre: T.formulario.barro },
  { valor: 'no_funciona', nombre: T.formulario.noFunciona },
];

/**
 * Un filtro del inventario: `<select>` nativo con la etiqueta encima, 44 px de alto. Activo (no
 * "Todos"): borde de 2 px y negrita. El borde es --anillo-seleccion, que es --marino-950 en claro y
 * se aclara en oscuro, donde el marino no se vería sobre el fondo.
 */
function Desplegable<V extends string>({
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
  const id = useId();
  const activo = valor !== 'todos';
  return (
    <div className="flex min-w-0 flex-col gap-1 md:w-44 xl:w-52">
      <label htmlFor={id} className="text-texto-suave text-[12px]">
        {etiqueta}
      </label>
      <select
        id={id}
        value={valor}
        onChange={(e) => alCambiar(e.target.value as V)}
        className={cn(
          'bg-papel text-texto rounded-campo min-h-11 w-full min-w-0 text-[14px]',
          activo
            ? 'border-2 border-[var(--anillo-seleccion)] px-[10px] font-semibold'
            : 'border-linea border px-[11px]',
        )}
      >
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}

const FORMATOS: { formato: Formato; nombre: string }[] = [
  { formato: 'xlsx', nombre: T.panel.excel },
  { formato: 'csv', nombre: T.panel.csv },
  { formato: 'geojson', nombre: T.panel.geojson },
];

/**
 * Exportar ▾ (docs/29 RV-123): un botón secundario que abre un menú con los tres formatos. Patrón
 * de botón de menú de WAI-ARIA: flechas, Inicio y Fin dentro del menú; Esc lo cierra y devuelve el
 * foco al botón; tocar fuera o Tab lo cierran sin quitar el foco de donde vaya. Sin filas que
 * exportar, deshabilitado y con el motivo debajo (UI-02). Mientras exporta, ocupado: dice
 * «Exportando…» y no abre el menú, pero no se deshabilita, porque un botón deshabilitado pierde el foco
 * que el menú le acaba de devolver.
 */
function MenuExportar({
  deshabilitado,
  ocupado,
  alElegir,
}: {
  deshabilitado: boolean;
  ocupado: boolean;
  alElegir: (f: Formato) => void;
}) {
  const [abierto, setAbierto] = useState<false | 'primero' | 'ultimo'>(false);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  const opciones = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
  const cerrar = (devolverFoco: boolean) => {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  };

  useEffect(() => {
    if (!abierto) return;
    const lista = opciones();
    (abierto === 'ultimo' ? lista.at(-1) : lista[0])?.focus();
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !boton.current?.contains(t)) setAbierto(false);
    };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierto]);

  function teclaMenu(e: ReactKeyboardEvent) {
    const lista = opciones();
    const i = lista.indexOf(document.activeElement as HTMLButtonElement);
    const ir = (n: number) => lista[(n + lista.length) % lista.length]?.focus();
    if (e.key === 'ArrowDown') ir(i + 1);
    else if (e.key === 'ArrowUp') ir(i - 1);
    else if (e.key === 'Home') ir(0);
    else if (e.key === 'End') ir(lista.length - 1);
    else if (e.key === 'Escape') cerrar(true);
    else if (e.key === 'Tab') return setAbierto(false);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  const motivo = `${id}-motivo`;
  return (
    <div className="relative flex flex-col items-end">
      {/* Las clases de <Boton variante="secundario">: Boton no reenvía la referencia del foco. */}
      <button
        ref={boton}
        type="button"
        id={`${id}-boton`}
        aria-haspopup="menu"
        aria-expanded={!!abierto}
        aria-controls={abierto ? `${id}-menu` : undefined}
        disabled={deshabilitado}
        aria-disabled={ocupado || undefined}
        aria-busy={ocupado || undefined}
        aria-describedby={deshabilitado ? motivo : undefined}
        onClick={() => {
          if (ocupado) return;
          if (abierto) cerrar(false);
          else setAbierto('primero');
        }}
        onKeyDown={(e) => {
          if (ocupado) return;
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          e.preventDefault();
          setAbierto(e.key === 'ArrowUp' ? 'ultimo' : 'primero');
        }}
        className="rounded-boton bg-papel text-texto border-texto disabled:bg-linea disabled:text-texto-suave flex min-h-11 min-w-11 items-center gap-1.5 border-[1.5px] px-4 text-[14px] font-semibold disabled:cursor-not-allowed aria-disabled:cursor-progress aria-disabled:opacity-60"
      >
        {ocupado ? T.panel.exportando : T.panel.exportar}
        <ChevronDown size={16} aria-hidden />
      </button>
      {deshabilitado && (
        <p id={motivo} className="text-texto-suave mt-0.5 text-[11px]">
          {T.panelInventario.nadaQueExportar}
        </p>
      )}
      {abierto && (
        <div
          ref={menu}
          id={`${id}-menu`}
          role="menu"
          aria-labelledby={`${id}-boton`}
          onKeyDown={teclaMenu}
          className="bg-papel border-linea rounded-tarjeta absolute top-full right-0 z-[500] mt-1 flex min-w-44 flex-col border py-1 shadow-[0_6px_24px_rgba(14,27,48,.28)]"
        >
          {FORMATOS.map(({ formato, nombre }) => (
            <button
              key={formato}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                cerrar(true);
                alElegir(formato);
              }}
              className="hover:bg-fondo focus:bg-fondo min-h-11 px-4 text-left text-[14px]"
            >
              {nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * La dirección, editable en la celda (FR-15). Controlada: enseña lo que se escribe y, al salir, solo
 * guarda si difiere de la dirección actual del punto (docs/31 RV-164). Nunca "— pen": el campo mide al
 * menos lo que su texto de "pendiente" (RV-79).
 */
function CeldaDireccion({ punto, alGuardar }: { punto: Punto; alGuardar: (p: Punto, valor: string) => Promise<void> }) {
  const dato = punto.direccion ?? '';
  const [valor, setValor] = useState(dato);
  // La dirección que enseñaba al empezar; si el dato cambia (Editar, otro administrador), la celda
  // vuelve a empezar con lo nuevo. Mientras se escribe en ella no: lo escrito no se pierde sin avisar,
  // y al salir se guarda encima, que es lo que se quería.
  const [base, setBase] = useState(dato);
  const [escribiendo, setEscribiendo] = useState(false);
  if (dato !== base && !escribiendo) {
    setBase(dato);
    setValor(dato);
  }
  return (
    <input
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      placeholder={T.panel.pendienteEscribe}
      aria-label={T.panelInventario.direccionDe(punto.codigo)}
      onFocus={() => setEscribiendo(true)}
      onBlur={() => {
        setEscribiendo(false);
        setBase(dato);
        void alGuardar(punto, valor);
      }}
      className="border-linea rounded-campo min-h-8 w-full min-w-[27ch] border border-transparent bg-transparent px-1 hover:border-[var(--linea)] focus:border-[var(--linea)]"
    />
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

type Dialogo = { punto: Punto; que: 'retirar' | 'borrar' | 'historial' } | null;

/** Inventario (FR-120, FL-24): tabla o mapa, con filtros, orden, páginas y acciones de jefatura. */
export default function Inventario() {
  const { busqueda, avisar } = usePanel();
  const { puntos } = usePuntos();
  const modo = useModo();
  const posicion = usePosicion();
  const ancha = usePanelAncho();
  const [tipo, setTipo] = useState<FiltrosInventario['tipo']>('todos');
  const [caudal, setCaudal] = useState<FiltrosInventario['caudal']>('todos');
  const [orden, setOrden] = useState<Orden>({ columna: 'codigo', ascendente: true });
  const [n, setN] = useState(0);
  const [mapa, setMapa] = useState(false);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  // Editar (docs/29 RV-124): el punto abierto, cuántos cambios lleva sin guardar, el punto al que se
  // quiere pasar si los hay, y el "Editar" que lo abrió, para devolverle el foco al cerrar.
  const [editando, setEditando] = useState<Punto | null>(null);
  const [estadoEditar, setEstadoEditar] = useState<EstadoEditar>({ pendientes: 0, ocupado: false });
  const [pasarA, setPasarA] = useState<{ punto: Punto; boton: HTMLElement } | null>(null);
  const origen = useRef<HTMLElement | null>(null);

  function abrirEditar(p: Punto, boton: HTMLElement) {
    if (editando?.id === p.id) return;
    // Mientras guarda, el punto abierto se queda: el botón dice «Guardando…».
    if (editando && estadoEditar.ocupado) return;
    // En el ordenador la tabla sigue a mano: con cambios sin guardar, pregunta antes de cambiar de punto.
    if (editando && estadoEditar.pendientes > 0) return setPasarA({ punto: p, boton });
    origen.current = boton;
    setEstadoEditar({ pendientes: 0, ocupado: false });
    setEditando(p);
  }

  // Solo cierra si sigue abierto ese punto: un guardado que acaba tarde no cierra otro.
  // El foco vuelve al "Editar" de la fila cuando Editar ya se ha cerrado: con velo o a pantalla
  // completa, hasta entonces la tabla está inert (RV-128) y no lo aceptaría. Si lo que cambia es que
  // se abre otro punto (un guardado tardío no cerró nada), no se mueve.
  const devolverFoco = useRef(false);
  const cerrarEditar = useCallback((id: string) => {
    setEditando((e) => (e?.id === id ? null : e));
    setEstadoEditar({ pendientes: 0, ocupado: false });
    devolverFoco.current = true;
  }, []);
  useEffect(() => {
    const devolver = devolverFoco.current;
    devolverFoco.current = false;
    if (devolver && !editando) origen.current?.focus();
  }, [editando]);
  const [exportando, setExportando] = useState(false);
  const [seleccion, setSeleccion] = useState<string | null>(null);

  const filtros: FiltrosInventario = { tipo, caudal, busqueda };
  const filtrados = useMemo(
    () => ordenarPor(inventario(puntos, filtros), orden),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [puntos, tipo, caudal, busqueda, orden],
  );
  const cuenta = useMemo(() => cuentaPorEstado(puntos, tipo), [puntos, tipo]);
  const conFiltro = tipo !== 'todos' || caudal !== 'todos';
  const total = paginas(filtrados.length);
  const pag = Math.min(n, total - 1);
  const visibles = pagina(filtrados, pag);

  function ordenarCon(columna: Columna) {
    setOrden((o) => ({ columna, ascendente: o.columna === columna ? !o.ascendente : true }));
    setN(0);
  }

  // El punto tal como está ahora, para la celda: un blur que llega con el punto ya cambiado
  // (por Editar o por otro administrador) compara con lo último, no con lo que había al pintar.
  const actuales = useRef(puntos);
  useEffect(() => {
    actuales.current = puntos;
  }, [puntos]);
  async function guardarDireccion(p: Punto, valor: string) {
    const ahora = actuales.current.find((x) => x.id === p.id) ?? p;
    if ((valor.trim() || null) === (ahora.direccion?.trim() || null)) return;
    const r = await editarPunto(p.id, { direccion: valor.trim() || null });
    if (!r.ok) return avisar(textoError(r.codigo), 'error');
    avisar(T.panelInventario.guardado(p.codigo));
  }

  async function exportarCon(formato: Formato) {
    setExportando(true);
    try {
      // El servidor filtra lo que entiende (05 §6.2); la búsqueda no la conoce, así que con búsqueda
      // el archivo lleva solo lo que se ve en la tabla (FR-160, RV-24).
      const r = await exportar(
        formato,
        filtrosExportacion(filtros),
        busqueda.trim() ? filtrados.map((p) => p.codigo) : undefined,
      );
      if (!r.ok) return avisar(textoError(r.codigo), 'error');
      avisar(T.panelInventario.exportado(r.datos));
    } catch (e) {
      // Generar el archivo en el navegador puede fallar (memoria, Blob): se dice y se anota (TR-90).
      anotarError(e);
      avisar(T.panelErrores.generico, 'error');
    } finally {
      setExportando(false);
    }
  }

  // La fila que se está editando, marcada como el campo que cambia (banda naranja a la izquierda).
  const claseFila = (p: Punto) =>
    cn(
      'border-linea border-b',
      editando?.id === p.id
        ? 'bg-[color-mix(in_srgb,#FFB000_8%,var(--papel))] shadow-[inset_4px_0_0_var(--naranja-600)]'
        : 'bg-papel',
    );

  // Piezas de cada punto, iguales en la tabla y en las filas de dos líneas (docs/20 RV-79).
  const diametroDe = (p: Punto) => (
    <>
      {T.formato.mm(p.diametro_mm)}
      {p.racor && <span className="text-texto-suave"> · {T.panelInventario.enganche(nombreRacor(p.racor))}</span>}
    </>
  );
  const estadoDe = (p: Punto) => (
    <span className={cn('rounded-chip px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap', claseChip(p.caudal))}>
      {nombreCaudal(p.caudal)}
    </span>
  );
  const direccionDe = (p: Punto) => <CeldaDireccion key={p.id} punto={p} alGuardar={guardarDireccion} />;
  const revisionDe = (p: Punto) => (
    <span className={cn('whitespace-nowrap', p.revision_caducada && 'text-rojo-texto font-semibold')}>
      {hace(p.fecha_ultima_revision)}
      <span className="text-texto-suave font-normal"> · {fechaCorta(p.fecha_ultima_revision)}</span>
    </span>
  );
  // En la tabla, en una línea: con Editar abierto al lado, la tabla se desplaza a lo ancho en vez de
  // partir las acciones en cuatro líneas (RV-124).
  const accionesDe = (p: Punto, enTabla = false) => (
    <div className={cn('flex items-center gap-1', enTabla ? 'flex-nowrap' : 'flex-wrap')}>
      {(['editar', 'retirar', 'historial', 'borrar'] as const).map((que) => (
        <button
          key={que}
          type="button"

          onClick={(e) => (que === 'editar' ? abrirEditar(p, e.currentTarget) : setDialogo({ punto: p, que }))}
          className={cn(
            'min-h-8 px-2 whitespace-nowrap underline',
            que === 'borrar' && 'text-rojo-texto ml-3',
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
          <tr key={p.id} data-editando={editando?.id === p.id || undefined} className={claseFila(p)}>
            <td className="font-datos px-3 py-1.5 whitespace-nowrap">{p.codigo}</td>
            <td className="px-3 py-1.5 whitespace-nowrap">{nombreTipo[p.tipo]}</td>
            <td className="px-3 py-1.5 whitespace-nowrap">{diametroDe(p)}</td>
            <td className="px-3 py-1.5">{estadoDe(p)}</td>
            <td className="px-3 py-1.5">{direccionDe(p)}</td>
            <td className="px-3 py-1.5">{p.nucleo ?? T.panelCola.sinNucleo}</td>
            <td className="px-3 py-1.5">{revisionDe(p)}</td>
            <td className="px-3 py-1.5">{accionesDe(p, true)}</td>
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
        <div
          key={p.id}
          role="row"
          data-editando={editando?.id === p.id || undefined}
          className={cn(claseFila(p), 'px-3 py-1.5')}
        >
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
    // Con Editar abierto en el ordenador (panel de 540 px sin velo), el Inventario se estrecha a su
    // lado: la tabla se sigue viendo y desplazando, y el Editar de otra fila queda a mano (RV-124).
    <div className={cn('flex min-h-0 flex-1 flex-col', editando && 'min-[1100px]:mr-[540px]')}>
      {/* docs/29 RV-123: Tipo y Estado a la izquierda, Exportar y Tabla/Mapa a la derecha, en una fila
          desde la tableta. En el móvil, los dos desplegables lado a lado y el resto debajo. */}
      <div className="border-linea bg-fondo flex flex-wrap items-end gap-x-3 gap-y-2 border-b px-3 py-2 text-sm">
        <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto">
          <Desplegable
            etiqueta={T.panelInventario.colTipo}
            opciones={TIPOS}
            valor={tipo}
            alCambiar={(v) => {
              setTipo(v);
              setN(0);
            }}
          />
          <Desplegable
            etiqueta={T.panelInventario.colEstado}
            opciones={ESTADOS.map((e) => ({ ...e, nombre: T.panelInventario.conNumero(e.nombre, cuenta[e.valor]) }))}
            valor={caudal}
            alCambiar={(v) => {
              setCaudal(v);
              setN(0);
            }}
          />
        </div>
        {conFiltro && (
          <button
            type="button"
            onClick={() => {
              setTipo('todos');
              setCaudal('todos');
              setN(0);
            }}
            className="text-texto min-h-11 px-1 underline"
          >
            {T.panelInventario.quitarFiltros}
          </button>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <MenuExportar deshabilitado={!filtrados.length} ocupado={exportando} alElegir={(f) => void exportarCon(f)} />
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

      {editando && (
        <Suspense fallback={null}>
          <EditarPunto
            key={editando.id}
            punto={editando}
            alCerrar={cerrarEditar}
            alEstado={setEstadoEditar}
            enPausa={!!dialogo || !!pasarA}
          />
        </Suspense>
      )}
      {pasarA && (
        <ConfirmarDescartar
          n={estadoEditar.pendientes}
          alDescartar={() => {
            origen.current = pasarA.boton;
            setEstadoEditar({ pendientes: 0, ocupado: false });
            setEditando(pasarA.punto);
            setPasarA(null);
          }}
          alSeguir={() => setPasarA(null)}
        />
      )}
      {(dialogo?.que === 'retirar' || dialogo?.que === 'borrar') && (
        <DialogoMotivo
          punto={dialogo.punto}
          accion={dialogo.que}
          alCerrar={() => setDialogo(null)}
          alHecho={() => {
            // Retirado o borrado el punto que se estaba editando: Editar ya no tiene qué guardar.
            if (editando?.id === dialogo.punto.id) {
              quitarEntradaDeEditar();
              setEditando(null);
              setEstadoEditar({ pendientes: 0, ocupado: false });
            }
            setDialogo(null);
          }}
        />
      )}
      {dialogo?.que === 'historial' && <DialogoHistorial punto={dialogo.punto} alCerrar={() => setDialogo(null)} />}
    </div>
  );
}
