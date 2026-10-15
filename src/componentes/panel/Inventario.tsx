import { ChevronDown, Download } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Filtros } from './Filtros';
import { BotonMas, EtiquetaEstado, Fecha } from './piezas';
import { DialogoHistorial, DialogoMotivo } from './dialogos';
import { ConfirmarDescartar, type EstadoEditar } from './descartar';

// Editar en su propia porción: ver descartar.tsx (RV-80).
const EditarPunto = lazy(() => import('./EditarPunto'));
import { usePanel } from './usar-panel';
import { MapaLeaflet } from '@/componentes/mapa/MapaLeaflet';
import { usePanelAncho, usePanelMovil } from '@/hooks/ancho';
import { MenuBoton } from './MenuBoton';
import { useModo, usePosicion, usePuntos } from '@/hooks/estado';
import { nombreRacor, nombreTipo } from '@/lib/ficha';
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
import { LIMITES } from '@/lib/limites';
import { type Punto } from '@/lib/puntos';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

// FR-120: Tipo y Estado, independientes y combinables (docs/29 RV-123, DEC-168), en el botón de filtros (DEC-214).
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

/** `completo`: no depende de los filtros ni de la búsqueda, así que vale aunque no se vea ninguna fila. */
const FORMATOS: { formato: Formato; nombre: string; completo?: boolean }[] = [
  { formato: 'xlsx', nombre: T.panel.excel },
  { formato: 'csv', nombre: T.panel.csv },
  { formato: 'geojson', nombre: T.panel.geojson },
  // docs/33 RV-335: el inventario completo en JSON, que antes estaba en Salud del sistema.
  { formato: 'json', nombre: T.panel.inventarioCompletoJson, completo: true },
];

/**
 * Exportar ▾ (docs/29 RV-123): un botón secundario que abre un menú con los formatos. Patrón
 * de botón de menú de WAI-ARIA: flechas, Inicio y Fin dentro del menú; Esc lo cierra y devuelve el
 * foco al botón; tocar fuera o Tab lo cierran sin quitar el foco de donde vaya. Sin filas que
 * exportar, los formatos de lo filtrado se deshabilitan con el motivo debajo (UI-02) y solo queda el
 * inventario completo (JSON), que no depende de los filtros (docs/33 RV-335). Mientras exporta, ocupado: dice
 * «Exportando…» y no abre el menú, pero no se deshabilita, porque un botón deshabilitado pierde el foco
 * que el menú le acaba de devolver.
 */
function MenuExportar({
  sinFilas,
  ocupado,
  icono = false,
  alElegir,
}: {
  sinFilas: boolean;
  ocupado: boolean;
  /** En el móvil (docs/38 RV-506): botón de icono de 44 × 44 y el motivo de «sin filas», dentro del menú. */
  icono?: boolean;
  alElegir: (f: Formato) => void;
}) {
  const motivo = `${useId()}-motivo`;
  if (icono) {
    return (
      <MenuBoton
        nombre={ocupado ? T.panel.exportando : T.panel.exportar}
        ocupado={ocupado}
        opciones={FORMATOS.map(({ formato, nombre, completo }) => ({
          nombre,
          alElegir: () => alElegir(formato),
          deshabilitada: sinFilas && !completo,
          motivo: sinFilas && !completo ? T.panelInventario.nadaQueExportar : undefined,
        }))}
        className="rounded-boton bg-papel text-texto border-texto grid size-11 place-items-center border-[1.5px] aria-disabled:cursor-progress aria-disabled:opacity-60"
      >
        <Download size={18} aria-hidden />
      </MenuBoton>
    );
  }
  return (
    <div className="relative flex flex-col items-end">
      {/* Las clases de <Boton variante="secundario">: Boton no reenvía la referencia del foco. */}
      <MenuBoton
        ocupado={ocupado}
        describedBy={sinFilas ? motivo : undefined}
        opciones={FORMATOS.map(({ formato, nombre, completo }) => ({
          nombre,
          alElegir: () => alElegir(formato),
          deshabilitada: sinFilas && !completo,
          descritaPor: sinFilas && !completo ? motivo : undefined,
        }))}
        className="rounded-boton bg-papel text-texto border-texto disabled:bg-linea disabled:text-texto-suave flex min-h-11 min-w-11 items-center gap-1.5 border-[1.5px] px-4 text-[14px] font-semibold disabled:cursor-not-allowed aria-disabled:cursor-progress aria-disabled:opacity-60"
      >
        {ocupado ? T.panel.exportando : T.panel.exportar}
        <ChevronDown size={16} aria-hidden />
      </MenuBoton>
      {sinFilas && (
        <p id={motivo} className="text-texto-suave mt-0.5 text-[11px]">
          {T.panelInventario.nadaQueExportar}
        </p>
      )}
    </div>
  );
}

/**
 * La dirección, editable en la celda (FR-15). Controlada: enseña lo que se escribe y, al salir, solo
 * guarda si se ha escrito algo en ella (docs/32 RV-256) y difiere de la dirección actual del punto
 * (docs/31 RV-164). Nunca "— pen": el campo mide al menos lo que su texto de "pendiente" (RV-79).
 */
function CeldaDireccion({
  punto,
  alGuardar,
}: {
  punto: Punto;
  alGuardar: (p: Punto, valor: string) => Promise<boolean>;
}) {
  const dato = punto.direccion ?? '';
  const [valor, setValor] = useState(dato);
  // `base`: lo que enseñaba la celda sin que nadie escribiera (lo que había al entrar, o lo último
  // guardado). `visto`: el último dato que ha llegado del servidor. Si el dato cambia (Editar, otro
  // administrador) y no se ha escrito nada, la celda enseña lo nuevo, también con el foco dentro.
  // Si se ha escrito, lo escrito no se pierde sin avisar, y al salir se guarda encima, que es lo
  // que se quería.
  const [base, setBase] = useState(dato);
  const [visto, setVisto] = useState(dato);
  const escrito = valor !== base;
  if (dato !== visto) {
    setVisto(dato);
    if (!escrito) {
      setBase(dato);
      setValor(dato);
    }
  }
  return (
    <input
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      placeholder={T.panelInventario.anadirDireccion}
      aria-label={T.panelInventario.direccionDe(punto.codigo)}
      maxLength={LIMITES.direccion}
      onBlur={() => {
        // Sin escribir no se guarda nada: un blur con el dato ya cambiado por una sincronización
        // escribiría la dirección vieja encima de la nueva (RV-256).
        if (!escrito) return;
        const escrita = valor;
        setBase(escrita);
        // Si no se ha podido guardar, lo escrito sigue siendo un cambio: el siguiente blur lo intenta.
        void alGuardar(punto, escrita).then((ok) => {
          if (!ok) setBase((b) => (b === escrita ? visto : b));
        });
      }}
      // Vacía, «＋ Añadir dirección» con borde discontinuo: que se vea que se pulsa (docs/38 RV-506). 44 px de alto
      // por debajo de 1.100 (UI-15).
      className={cn(
        'rounded-campo min-h-11 w-full border bg-transparent px-1 min-[1100px]:min-h-8',
        valor
          ? 'border-transparent hover:border-[var(--linea)] focus:border-[var(--linea)]'
          : 'rounded-[6px] border-dashed border-[var(--linea)] placeholder:text-texto',
      )}
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
  const movil = usePanelMovil();
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
  async function guardarDireccion(p: Punto, valor: string): Promise<boolean> {
    const ahora = actuales.current.find((x) => x.id === p.id) ?? p;
    if ((valor.trim() || null) === (ahora.direccion?.trim() || null)) return true;
    const r = await editarPunto(p.id, { direccion: valor.trim() || null });
    if (!r.ok) {
      avisar(textoError(r.codigo), 'error');
      return false;
    }
    avisar(T.panelInventario.guardado(p.codigo));
    return true;
  }

  async function exportarCon(formato: Formato) {
    setExportando(true);
    try {
      // El inventario completo (JSON) no lleva filtros ni búsqueda: es todo, para consulta (RV-335).
      if (formato === 'json') {
        const r = await exportar('json', {});
        if (!r.ok) return avisar(textoError(r.codigo), 'error');
        return avisar(T.panelAjustes.inventarioDescargado(r.datos));
      }
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

  // Piezas de cada punto, iguales en la tabla y en las filas (docs/20 RV-79; docs/38 RV-506).
  const diametroDe = (p: Punto) => (
    <>
      {T.formato.mm(p.diametro_mm)}
      {p.racor && <span className="text-texto-suave"> · {T.panelInventario.enganche(nombreRacor(p.racor))}</span>}
    </>
  );
  // La fila que está abierta en Editar enseña la dirección como texto: se cambia en Editar. Si se
  // pudiera guardar también aquí, Editar lo tomaría por un cambio de otro administrador (RV-165).
  const direccionDe = (p: Punto) =>
    editando?.id === p.id ? (
      <span className="block min-h-8 px-1 py-1">{p.direccion ?? T.panelEditar.vacio}</span>
    ) : (
      <CeldaDireccion key={p.id} punto={p} alGuardar={guardarDireccion} />
    );
  // Una fecha, un formato (UI-12, DEC-215): la última revisión es una `date`, sin hora.
  const revisionDe = (p: Punto) => (
    <Fecha f={p.fecha_ultima_revision} soloDia className={cn(p.revision_caducada && 'text-rojo-texto font-semibold')} />
  );
  // «⋯» de la fila (docs/38 RV-502): Historial, Retirar y Borrar, que abren los diálogos de siempre. El menú
  // devuelve el foco a «⋯» antes de abrirlos, así que al cerrarlos el foco vuelve ahí.
  const masDe = (p: Punto) => (
    <BotonMas
      nombre={p.codigo}
      opciones={[
        { nombre: T.panel.historial, alElegir: () => setDialogo({ punto: p, que: 'historial' }) },
        { nombre: T.panel.retirar, alElegir: () => setDialogo({ punto: p, que: 'retirar' }) },
        { nombre: T.panel.borrar, alElegir: () => setDialogo({ punto: p, que: 'borrar' }), peligro: true },
      ]}
    />
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

  // Desde 1.100 px, la tabla (DEC-213), con «Editar» y «⋯» en Acciones (DEC-215).
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
            <td className="px-3 py-1.5">
              <EtiquetaEstado caudal={p.caudal} />
            </td>
            <td className="min-w-[27ch] px-3 py-1.5">{direccionDe(p)}</td>
            <td className="px-3 py-1.5">{p.nucleo ?? T.panelCola.sinNucleo}</td>
            <td className="px-3 py-1.5 whitespace-nowrap">{revisionDe(p)}</td>
            <td className="px-3 py-1.5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => abrirEditar(p, e.currentTarget)}
                  className="rounded-boton bg-papel text-texto border-texto min-h-8 border-[1.5px] px-3 font-semibold whitespace-nowrap"
                >
                  {T.panel.editar}
                </button>
                {masDe(p)}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  // Por debajo de 1.100 px, una lista de filas de tres líneas (docs/38 RV-506, UI-11): tocar la fila abre Editar
  // (un botón que la cubre entera); la dirección y «⋯» van por encima y hacen lo suyo. Sin fila de cabeceras: el
  // orden está en el botón de filtros. Para el lector, una lista con un elemento por punto.
  const filas = (
    <ul aria-label={T.panelCola.inventario} className="text-[13px]">
      {visibles.map((p) => (
        <li
          key={p.id}
          data-editando={editando?.id === p.id || undefined}
          className={cn(claseFila(p), 'relative flex items-start gap-1 py-1.5 pr-1 pl-3')}
        >
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <button
                type="button"
                onClick={(e) => abrirEditar(p, e.currentTarget)}
                aria-label={T.panelInventario.editarPunto(p.codigo)}
                className="font-datos text-[14px] font-semibold after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-[-2px] focus-visible:after:outline-[var(--anillo-seleccion)]"
              >
                {p.codigo}
              </button>
              <span className="text-texto-suave">
                {nombreTipo[p.tipo]} · {diametroDe(p)}
              </span>
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <EtiquetaEstado caudal={p.caudal} />
              <span className="relative z-10 min-w-0 flex-1 basis-[20ch]">{direccionDe(p)}</span>
              <span className="text-texto-suave">· {p.nucleo ?? T.panelCola.sinNucleo}</span>
            </div>
            <p className="mt-1">
              {`${T.panelInventario.revisado} `}
              {revisionDe(p)}
            </p>
          </div>
          <div className="relative z-10 shrink-0">{masDe(p)}</div>
          <span aria-hidden className="text-texto-suave self-center pr-1 text-[18px]">
            ›
          </span>
        </li>
      ))}
    </ul>
  );

  // El botón de filtros (UI-19, DEC-214): Tipo y Estado; por debajo de 1.100, también el orden.
  const nombreColumna = COLUMNAS.find((c) => c.clave === orden.columna)?.nombre ?? '';
  const flecha = orden.ascendente ? '▲' : '▼';
  const partes = [
    tipo !== 'todos' && TIPOS.find((t) => t.valor === tipo)?.nombre,
    caudal !== 'todos' && ESTADOS.find((e) => e.valor === caudal)?.nombre,
  ].filter((x): x is string => !!x);
  const resumen = ancha
    ? partes.join(' · ') || T.panelInventario.todosLosPuntos
    : [...(partes.length ? partes : [T.mapa.todos]), `${nombreColumna} ${flecha}`].join(' · ');
  const filtrosBoton = (
    <Filtros
      titulo={ancha ? T.mapa.filtrar : T.panelInventario.filtrarYOrdenar}
      resumen={resumen}
      activo={conFiltro}
      lleno={movil}
      alQuitar={() => {
        setTipo('todos');
        setCaudal('todos');
        setN(0);
      }}
      grupos={[
        {
          titulo: T.panelInventario.colTipo,
          valor: tipo,
          alCambiar: (v: FiltrosInventario['tipo']) => {
            setTipo(v);
            setN(0);
          },
          opciones: TIPOS.map((t) => ({ valor: t.valor, nombre: t.nombre })),
        },
        {
          titulo: T.panelInventario.colEstado,
          valor: caudal,
          alCambiar: (v: FiltrosInventario['caudal']) => {
            setCaudal(v);
            setN(0);
          },
          opciones: ESTADOS.map((e) => ({
            valor: e.valor,
            nombre: e.nombre,
            cuenta: cuenta[e.valor],
            adorno: e.valor === 'todos' ? undefined : <EtiquetaEstado caudal={e.valor} />,
          })),
        },
        ...(ancha
          ? []
          : [
              {
                titulo: T.panelInventario.ordenarPorTitulo,
                ayuda: T.panelInventario.ayudaOrden,
                valor: orden.columna,
                alCambiar: (v: Columna) => ordenarCon(v),
                opciones: COLUMNAS.map((c) => ({
                  valor: c.clave,
                  nombre: orden.columna === c.clave ? `${c.nombre} ${flecha}` : c.nombre,
                })),
              },
            ]),
      ]}
    />
  );

  return (
    // Con Editar abierto en el ordenador (panel de 540 px sin velo), el Inventario se estrecha a su
    // lado: la tabla se sigue viendo y desplazando, y el Editar de otra fila queda a mano (RV-124).
    <div className={cn('flex min-h-0 flex-1 flex-col', editando && 'min-[1100px]:mr-[540px]')}>
      {/* docs/38 RV-506: el botón de filtros a la izquierda; Exportar y Tabla/Mapa a la derecha. En el móvil, en una
          fila: el botón ocupa lo que queda y Exportar es un botón de icono. */}
      <div className="border-linea bg-fondo flex items-center gap-2 border-b px-3 py-2 text-sm">
        {filtrosBoton}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <MenuExportar
            sinFilas={!filtrados.length}
            ocupado={exportando}
            icono={movil}
            alElegir={(f) => void exportarCon(f)}
          />
          <div role="radiogroup" aria-label={T.panelInventario.vista} className="flex gap-1.5">
            {[false, true].map((esMapa) => (
              <button
                key={String(esMapa)}
                type="button"
                role="radio"
                aria-checked={mapa === esMapa}
                onClick={() => setMapa(esMapa)}
                className={cn(
                  'border-linea min-h-11 rounded-full border px-3 text-[13px] min-[1100px]:min-h-9',
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

          {/* El total ya está en la pestaña: aquí solo con filtro o búsqueda (UI-16, DEC-215). */}
          <div className="text-texto-suave flex flex-wrap items-center gap-3 px-3 py-2 text-[13px]">
            {busqueda.trim() ? (
              <span>{T.panelInventario.puntosConBusqueda(filtrados.length)}</span>
            ) : (
              conFiltro && <span>{T.panelInventario.puntosConFiltro(filtrados.length)}</span>
            )}
            {ancha && <span>{T.panelInventario.ayudaTabla}</span>}
            {total > 1 && (
              <nav aria-label={T.panelInventario.paginas} className="ml-auto flex flex-wrap gap-1">
                {Array.from({ length: total }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-current={i === pag || undefined}
                    onClick={() => setN(i)}
                    className={cn(
                      'border-linea min-h-11 min-w-11 rounded border px-2 min-[1100px]:min-h-8 min-[1100px]:min-w-8',
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
            actual={puntos.find((p) => p.id === editando.id)}
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
