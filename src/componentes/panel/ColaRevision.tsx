import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { capasDe } from '../mapa/capas-leaflet';
import { usePanel } from './usar-panel';
import { DetallePropuesta } from './DetallePropuesta';
import { ErrorCarga, EtiquetaOperacion } from './piezas';
import { Boton } from '@/componentes/Boton';
import { useCarga } from '@/hooks/carga';
import { useModo, usePuntos } from '@/hooks/estado';
import { useModal } from '@/lib/foco-modal';
import { LIMITES } from '@/lib/limites';
import { ETIQUETA_OPERACION } from '@/lib/nombres-operacion';
import { cargarParametros } from '@/lib/panel/ajustes';
import {
  type EstadoModeracion,
  type PlanMapa,
  type PropuestaPanel,
  aprobarLote,
  cargarCola,
  cargarHistorial,
  coincide,
  lineaCola,
  planMapa,
  rechazarLote,
  resumenLote,
  separarLote,
  tieneAviso,
} from '@/lib/panel/cola';
import { textoError } from '@/lib/panel/errores';
import type { Operacion } from '@/lib/propuestas';
import type { Punto } from '@/lib/puntos';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

const ESTADOS: { valor: EstadoModeracion; nombre: string }[] = [
  { valor: 'pendiente', nombre: T.panelCola.pendientes },
  { valor: 'aprobada', nombre: T.panelCola.aprobadas },
  { valor: 'rechazada', nombre: T.panelCola.rechazadas },
  { valor: 'retirada_por_autor', nombre: T.panelCola.retiradasPorAutor },
];

const OPERACIONES: Operacion[] = ['alta', 'revision', 'estado', 'datos', 'ubicacion', 'retirada'];

/**
 * Desde 1.100 px, la cola a la izquierda (340 px) y el detalle en todo el resto; por debajo, dos
 * pantallas (docs/25 RV-110, DEC-158). El mismo corte que las clases `min-[1100px]:` de abajo.
 */
const COLA_Y_DETALLE = '(min-width: 1100px)';

function suscribirAncho(o: () => void) {
  const m = window.matchMedia(COLA_Y_DETALLE);
  m.addEventListener('change', o);
  return () => m.removeEventListener('change', o);
}
const useColaYDetalle = () =>
  useSyncExternalStore(
    suscribirAncho,
    () => window.matchMedia(COLA_Y_DETALLE).matches,
    () => true,
  );

/** La propuesta abierta va en la URL (?p=…): en tableta y móvil, "atrás" vuelve a la cola. */
const PARAMETRO = 'p';
/** Marca, en el estado del historial, la entrada que se apiló al abrir una propuesta (RV-163). */
const APILADA = 'colaApilada';

/** Cola de revisión (FR-100–FR-110, FL-21–FL-23): lista con filtros y casillas, y el detalle. */
export default function ColaRevision({ alCambiar }: { alCambiar: () => void }) {
  const { busqueda, avisar } = usePanel();
  const { puntos } = usePuntos();
  const ancho = useColaYDetalle();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navegar = useNavigate();
  const [estado, setEstado] = useState<EstadoModeracion>('pendiente');
  const [operacion, setOperacion] = useState<Operacion | ''>('');
  const [nucleo, setNucleo] = useState('');
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [rechazoLote, setRechazoLote] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const activa = params.get(PARAMETRO);

  const carga = useCarga(
    () => (estado === 'pendiente' ? cargarCola() : cargarHistorial(estado)),
    [estado],
    estado === 'pendiente' ? 60_000 : undefined,
    // Al cambiar de Pendientes a Aprobadas, nada de las filas de antes mientras carga (docs/32 RV-250).
    { vaciarAlCambiar: true },
  );
  const cargando = carga.estado === 'cargando';
  // El radio del círculo de duplicado (FR-51) es el de config. Sin poder leerlo no se dibuja: un radio
  // supuesto podría no coincidir con el aviso de duplicado, que usa el de verdad (DEC-159).
  const parametros = useCarga(() => cargarParametros(), []);
  const radioDuplicado = parametros.datos?.radio_duplicado_m ?? null;
  const todas = useMemo(() => carga.datos ?? [], [carga.datos]);
  const nucleos = useMemo(
    () =>
      [...new Set(todas.map((p) => p.nucleo).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b, 'es')),
    [todas],
  );
  const visibles = useMemo(
    () =>
      todas.filter(
        (p) => (!operacion || p.operacion === operacion) && (!nucleo || p.nucleo === nucleo) && coincide(p, busqueda),
      ),
    [todas, operacion, nucleo, busqueda],
  );
  // En el ordenador siempre hay una abierta; en tableta y móvil, solo la que se ha tocado.
  const abierta = visibles.find((p) => p.id === activa) ?? null;
  // La primera del ordenador se fija por id en ?p= (efecto de abajo): una propuesta nueva entra arriba
  // de la lista y, si no, el detalle saltaría a ella con el formulario a medias (docs/31 RV-161).
  // Hasta que el efecto la fija, la misma primera, para no pintar un detalle vacío.
  const seleccion = abierta ?? (ancho ? (visibles[0] ?? null) : null);
  const pendientes = estado === 'pendiente';
  const elegidas = visibles.filter((p) => marcadas.has(p.id));

  function abrir(id: string | null, apilar: boolean) {
    setParams(
      (actual) => {
        const n = new URLSearchParams(actual);
        if (id) n.set(PARAMETRO, id);
        else n.delete(PARAMETRO);
        return n;
      },
      // La entrada apilada se marca: al volver, "atrás" la quita en vez de añadir otra (RV-163).
      apilar ? { state: { [APILADA]: true } } : { replace: true },
    );
  }

  // Volver a la cola desde el detalle a pantalla completa: si la entrada de arriba es la que se apiló
  // al abrir, se vuelve atrás; si se llegó con ?p= en la dirección, se quita sin apilar (RV-163).
  // Mientras "atrás" no ha llegado, otra llamada (la recarga que ve la propuesta ya resuelta) no vuelve
  // a ir atrás: saldría de la cola.
  const volviendo = useRef(false);
  // Cualquier navegación nueva (también una que deja el mismo ?p=) la desbloquea: "‹" nunca se queda muerto.
  useEffect(() => {
    volviendo.current = false;
  }, [location.key]);
  function volverACola() {
    if (volviendo.current) return;
    if ((location.state as Record<string, unknown> | null)?.[APILADA]) {
      volviendo.current = true;
      navegar(-1);
    } else abrir(null, false);
  }

  // Una ?p= que ya no está en la lista (resuelta por otra persona, otra pestaña): fuera de la URL,
  // para que la dirección no diga una propuesta y la pantalla enseñe otra. En el ordenador, en su
  // lugar la primera, fija por id: solo cambia si jefatura toca otra o si la abierta se va (RV-161).
  const cargada = !!carga.datos;
  const sinAbierta = !!activa && cargada && !todas.some((p) => p.id === activa);
  const fijar = ancho && cargada && !abierta ? (visibles[0]?.id ?? null) : undefined;
  useEffect(() => {
    if (fijar !== undefined) {
      if (fijar !== activa) abrir(fijar, false);
      // En tableta y móvil, la entrada que se apiló al abrirla se quita, en vez de dejar dos de la cola
      // y que "atrás" no haga nada (docs/32 RV-263).
    } else if (sinAbierta) volverACola();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinAbierta, fijar]);

  // En tableta y móvil, al cerrar el detalle el foco vuelve a la fila de la propuesta o, si ya no está
  // (resuelta), a la lista: no se queda en <body> (TR-35, docs/32 RV-263).
  const lista = useRef<HTMLElement>(null);
  const idPantalla = ancho ? null : (seleccion?.id ?? null);
  const pantallaAntes = useRef<string | null>(null);
  // La que se acaba de resolver aquí: su fila aún está hasta que llegue la recarga, y luego se va.
  const resuelta = useRef<string | null>(null);
  useEffect(() => {
    const antes = pantallaAntes.current;
    pantallaAntes.current = idPantalla;
    if (!antes || idPantalla) return;
    const fila =
      antes === resuelta.current
        ? null
        : lista.current?.querySelector<HTMLElement>(`[data-propuesta="${CSS.escape(antes)}"]`);
    (fila ?? lista.current)?.focus();
  }, [idPantalla]);

  function cambiarEstado(e: EstadoModeracion) {
    setEstado(e);
    setMarcadas(new Set());
    abrir(null, false);
    setRechazoLote(false);
  }

  // En tableta y móvil, abrir una propuesta es otra pantalla: se apila para que "atrás" vuelva.
  // Tocar la que ya está abierta no apila otra entrada igual (un doble toque).
  const elegir = (p: PropuestaPanel) => {
    if (p.id !== activa) abrir(p.id, !ancho);
  };

  function marcar(id: string) {
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function hecho() {
    alCambiar();
    // Resuelta la abierta, en tableta y móvil se vuelve a la cola.
    resuelta.current = activa;
    if (!ancho) volverACola();
    await carga.recargar();
  }

  // Un error al decidir: se ve el estado real sin cerrar el detalle ni perder lo escrito (RV-252). El
  // detalle sabe si ha llegado: sin la lista nueva no pide confirmar lo que no ha visto.
  function recargar() {
    alCambiar();
    return carga.recargarYVer();
  }

  const nombre = (id: string) => {
    const p = todas.find((x) => x.id === id);
    return p ? `${ETIQUETA_OPERACION[p.operacion]} ${p.codigo ?? T.panelCola.nuevo}` : id;
  };

  async function aprobarMarcadas() {
    // Las de un punto que ya no está activo no se mandan: se saltan y se dice (RV-330).
    const { aprobables, saltadas } = separarLote(elegidas);
    if (!aprobables.length) {
      setMarcadas(new Set());
      return avisar(resumenLote(saltadas, nombre), 'error');
    }
    setOcupado(true);
    const r = await aprobarLote(aprobables.map((p) => p.id));
    setOcupado(false);
    if (!r.ok) return avisar(textoError(r.codigo), 'error');
    setMarcadas(new Set());
    const resultados = [...r.datos, ...saltadas];
    const omitidas = resultados.some((x) => x.resultado === 'omitida');
    avisar(resumenLote(resultados, nombre), omitidas ? 'error' : 'ok');
    await hecho();
  }

  async function rechazarMarcadas(motivo: string) {
    setOcupado(true);
    const { hechas, fallos } = await rechazarLote(
      elegidas.map((p) => p.id),
      motivo,
    );
    setOcupado(false);
    setRechazoLote(false);
    setMarcadas(new Set());
    if (fallos.length) avisar(`${T.panelCola.loteRechazadas(hechas)} ${textoError(fallos[0])}`, 'error');
    else avisar(T.panelCola.loteRechazadas(hechas));
    await hecho();
  }

  const botonesLote = (
    <>
      <BotonBarra disabled={!elegidas.length || ocupado || cargando} onClick={() => void aprobarMarcadas()}>
        {T.panelCola.aprobarSeleccionadas}
      </BotonBarra>
      <BotonBarra disabled={!elegidas.length || ocupado || cargando} onClick={() => setRechazoLote(true)}>
        {T.panelCola.rechazarSeleccionadas}
      </BotonBarra>
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-linea bg-fondo flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm">
        {pendientes ? (
          <>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                className="size-4"
                checked={elegidas.length > 0 && elegidas.length === visibles.length}
                disabled={!visibles.length || cargando}
                onChange={(e) => setMarcadas(new Set(e.target.checked ? visibles.map((p) => p.id) : []))}
                aria-label={T.panelCola.seleccionarTodas}
              />
              <span className={cn(elegidas.length ? 'text-texto font-semibold' : 'text-texto-suave')}>
                {elegidas.length ? T.panelCola.seleccionadas(elegidas.length) : T.panelCola.ningunaSeleccionada}
              </span>
            </label>
            {/* En tableta y móvil, la barra de abajo (FR-107). */}
            {ancho && botonesLote}
          </>
        ) : (
          <span className="text-texto-suave">{T.panelCola.soloLectura}</span>
        )}
        <div role="radiogroup" aria-label={T.panelCola.filtroEstado} className="flex flex-wrap gap-1.5 lg:ml-4">
          {ESTADOS.map((e) => (
            <button
              key={e.valor}
              type="button"
              role="radio"
              aria-checked={estado === e.valor}
              onClick={() => cambiarEstado(e.valor)}
              className={cn(
                'border-linea min-h-9 rounded-full border px-3 text-[13px]',
                estado === e.valor ? 'bg-barra border-barra text-white' : 'bg-papel text-texto-suave',
              )}
            >
              {e.nombre}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <span className="text-texto-suave">{T.panelCola.filtrar}</span>
          <select
            aria-label={T.panelCola.filtroOperacion}
            value={operacion}
            onChange={(e) => setOperacion(e.target.value as Operacion | '')}
            className="border-linea bg-papel rounded-campo min-h-9 border px-2"
          >
            <option value="">{T.panelCola.todasOperaciones}</option>
            {OPERACIONES.map((o) => (
              <option key={o} value={o}>
                {ETIQUETA_OPERACION[o]}
              </option>
            ))}
          </select>
          <select
            aria-label={T.panelCola.filtroNucleo}
            value={nucleo}
            onChange={(e) => setNucleo(e.target.value)}
            className="border-linea bg-papel rounded-campo min-h-9 border px-2"
          >
            <option value="">{T.panelCola.todosNucleos}</option>
            {nucleos.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {rechazoLote && (
        <RechazoLote
          n={elegidas.length}
          ocupado={ocupado}
          alConfirmar={(m) => void rechazarMarcadas(m)}
          alCancelar={() => setRechazoLote(false)}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col min-[1100px]:flex-row">
        <section
          ref={lista}
          tabIndex={-1}
          aria-label={T.panelCola.colaRevision}
          className="border-linea outline-none bg-papel flex-1 min-[1100px]:sticky min-[1100px]:top-0 min-[1100px]:max-h-dvh min-[1100px]:w-[340px] min-[1100px]:flex-none min-[1100px]:self-start min-[1100px]:overflow-y-auto min-[1100px]:border-r"
        >
          <Lista
            carga={carga}
            visibles={visibles}
            pendientes={pendientes}
            seleccion={ancho ? seleccion : null}
            marcadas={marcadas}
            busqueda={busqueda}
            hayFiltro={!!operacion || !!nucleo}
            puntos={ancho ? null : puntos}
            alElegir={elegir}
            alMarcar={marcar}
          />
        </section>
        {ancho ? (
          <section
            aria-label={
              seleccion
                ? `${seleccion.codigo ?? T.panelCola.nuevo} · ${ETIQUETA_OPERACION[seleccion.operacion]}`
                : undefined
            }
            className="bg-fondo min-w-0 flex-1"
          >
            {seleccion ? (
              <DetallePropuesta
                key={seleccion.id}
                p={seleccion}
                puntos={puntos}
                radioDuplicado={radioDuplicado}
                alHecho={() => void hecho()}
                alRecargar={recargar}
              />
            ) : (
              carga.estado !== 'cargando' && <p className="text-texto-suave p-4 text-sm">{T.panelCola.eligeUna}</p>
            )}
          </section>
        ) : (
          <>
            {pendientes && visibles.length > 0 && (
              <div className="bg-barra sticky bottom-0 z-10 flex flex-wrap items-center gap-2 px-3 py-2 text-sm text-white">
                {elegidas.length ? (
                  <>
                    <span className="mr-auto font-semibold">{T.panelCola.seleccionadas(elegidas.length)}</span>
                    {botonesLote}
                  </>
                ) : (
                  <span className="min-h-9 py-2 font-semibold">{T.panelCola.tocaUna}</span>
                )}
              </div>
            )}
            {seleccion && (
              <PantallaDetalle
                titulo={`${seleccion.codigo ?? T.panelCola.nuevo} · ${ETIQUETA_OPERACION[seleccion.operacion]}`}
              >
                <DetallePropuesta
                  key={seleccion.id}
                  p={seleccion}
                  puntos={puntos}
                  radioDuplicado={radioDuplicado}
                  alHecho={() => void hecho()}
                  alRecargar={recargar}
                  alVolver={volverACola}
                />
              </PantallaDetalle>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Lista({
  carga,
  visibles,
  pendientes,
  seleccion,
  marcadas,
  busqueda,
  hayFiltro,
  puntos,
  alElegir,
  alMarcar,
}: {
  carga: ReturnType<typeof useCarga<PropuestaPanel[]>>;
  visibles: PropuestaPanel[];
  pendientes: boolean;
  seleccion: PropuestaPanel | null;
  marcadas: Set<string>;
  busqueda: string;
  hayFiltro: boolean;
  /** En tableta y móvil, cada fila lleva su mapita: hace falta el inventario para situarla. */
  puntos: Punto[] | null;
  alElegir: (p: PropuestaPanel) => void;
  alMarcar: (id: string) => void;
}) {
  if (carga.estado === 'cargando' && !carga.datos) {
    return <p className="text-texto-suave p-4 text-sm">{T.panelCola.cargando}</p>;
  }
  // Un error se enseña aunque haya filas: las de la última carga buena pueden ser viejas (RV-250).
  const error = carga.estado === 'error' && (
    <ErrorCarga codigo={carga.codigo} alReintentar={() => void carga.recargar()} />
  );
  if (error && !carga.datos) return error;
  if (!visibles.length) {
    const texto = busqueda.trim()
      ? T.panelCola.busquedaVacia(busqueda.trim())
      : !pendientes
        ? T.panelCola.historialVacio
        : hayFiltro
          ? T.panelCola.filtroVacio
          : T.panelCola.colaVacia;
    return (
      <>
        {error}
        <p className="text-texto-suave p-6 text-center text-sm">{texto}</p>
      </>
    );
  }
  return (
    <>
      {error}
      <ul>
        {visibles.map((p) => {
          const nombre = `${ETIQUETA_OPERACION[p.operacion]} ${p.codigo ?? T.panelCola.nuevo}`;
          const activa = p.id === seleccion?.id;
          return (
            <li
              key={p.id}
              className={cn(
                'border-linea flex items-center gap-2.5 border-b px-3 py-2',
                activa && 'bg-fila-elegida shadow-[inset_3px_0_0_var(--marino-700)]',
              )}
            >
              {pendientes && (
                <input
                  type="checkbox"
                  className="size-4 shrink-0"
                  checked={marcadas.has(p.id)}
                  onChange={() => alMarcar(p.id)}
                  aria-label={T.panelCola.seleccionar(nombre)}
                />
              )}
              {puntos && (
                <Mapita
                  plan={planMapa(
                    p,
                    puntos.find((x) => x.id === p.punto_id),
                  )}
                />
              )}
              <button
                type="button"
                data-propuesta={p.id}
                onClick={() => alElegir(p)}
                aria-current={activa || undefined}
                className="min-h-11 min-w-0 flex-1 text-left"
              >
                <span className="flex items-center gap-1.5">
                  <EtiquetaOperacion operacion={p.operacion} />
                  <span className="font-datos text-texto-suave text-[13px]">{p.codigo ?? T.panelCola.nuevo}</span>
                  {pendientes && tieneAviso(p) && (
                    <TriangleAlert size={14} className="text-ambar-texto" aria-label={T.panelCola.senalAviso} />
                  )}
                </span>
                <span className="text-texto-suave block truncate text-[13px]">{lineaCola(p)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * El detalle a pantalla completa de tableta y móvil (RV-110) es una ventana modal (docs/32 RV-263): va
 * en un portal para que `useModal` deje inert la cola de detrás. El foco inicial lo pone el detalle, en
 * su "‹"; la vuelta del foco a la fila, la cola.
 */
function PantallaDetalle({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const caja = useRef<HTMLElement>(null);
  useModal(caja);
  return createPortal(
    <section ref={caja} role="dialog" aria-modal="true" aria-label={titulo} className="bg-fondo fixed inset-0 z-40">
      {children}
    </section>,
    document.body,
  );
}

/**
 * El mapita de 62 × 48 px de cada fila en tableta y móvil (RV-110): el sitio del punto, siempre sobre
 * el mapa base propio (sin red). Se dibuja al entrar en la vista, para no crear todos a la vez.
 */
function Mapita({ plan }: { plan: PlanMapa }) {
  const caja = useRef<HTMLDivElement>(null);
  const modo = useModo();
  const [visible, setVisible] = useState(false);
  const sitio = plan.propuesta ?? plan.actual;
  const lat = sitio?.lat;
  const lng = sitio?.lng;
  const naranja = !!plan.propuesta;

  useEffect(() => {
    const el = caja.current;
    if (!el || visible) return;
    const o = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setVisible(true));
    o.observe(el);
    return () => o.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !caja.current || lat == null || lng == null) return;
    const m = L.map(caja.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    }).setView([lat, lng], 17);
    capasDe('base', modo).forEach((c) => c.addTo(m));
    // Naranja, el pin propuesto (06 §4.3); marino, un punto que ya existe.
    L.circleMarker([lat, lng], {
      radius: 4.5,
      weight: 2,
      color: '#fff',
      // Con los tokens de 06 (clase CSS): un color escrito a mano no sigue a los cambios de paleta.
      className: naranja ? '[fill:var(--naranja-600)]' : '[fill:var(--marino-950)]',
      fillOpacity: 1,
      interactive: false,
    }).addTo(m);
    return () => {
      m.remove();
    };
  }, [visible, lat, lng, modo, naranja]);

  return (
    <div
      ref={caja}
      aria-hidden
      data-testid="mapita"
      className="border-linea pointer-events-none isolate h-12 w-[62px] shrink-0 overflow-hidden rounded-md border bg-[#ECEAE1]"
    />
  );
}

function BotonBarra({ className, ...resto }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'border-linea bg-papel text-texto rounded-campo min-h-9 border px-3 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...resto}
    />
  );
}

function RechazoLote({
  n,
  ocupado,
  alConfirmar,
  alCancelar,
}: {
  n: number;
  ocupado: boolean;
  alConfirmar: (motivo: string) => void;
  alCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [intentado, setIntentado] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  // Sale arriba de la cola y el botón que lo abre está en la barra de abajo: en el móvil quedaría fuera
  // de la vista. Al abrirlo se pone a la vista y el foco va al motivo (docs/31 RV-163).
  useEffect(() => {
    caja.current?.scrollIntoView?.({ block: 'start' });
    campo.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div ref={caja} className="border-linea bg-papel border-b p-3 text-sm">
      <p className="font-semibold">{T.panelCola.rechazarVarias(n)}</p>
      <label className="mt-2 block">
        <span className="text-texto-suave text-[13px]">{T.panelCola.motivoComun}</span>
        <textarea
          ref={campo}
          value={motivo}
          maxLength={LIMITES.motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="border-linea rounded-campo mt-1 block w-full border p-2"
          rows={2}
        />
      </label>
      <p className="text-texto-suave mt-1 text-xs">{T.panelCola.avisoNombres}</p>
      {intentado && !motivo.trim() && <p className="text-rojo-texto mt-1 text-xs">{T.panelCola.sinMotivo}</p>}
      <div className="mt-2 flex gap-3">
        <Boton
          variante="destructivo"
          disabled={ocupado}
          onClick={() => {
            setIntentado(true);
            if (motivo.trim()) alConfirmar(motivo);
          }}
        >
          {T.panelCola.confirmarRechazo}
        </Boton>
        <Boton variante="secundario" onClick={alCancelar}>
          {T.panelCola.cancelar}
        </Boton>
      </div>
    </div>
  );
}
