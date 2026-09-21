import { TriangleAlert } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { usePanel } from './usar-panel';
import { DetallePropuesta } from './DetallePropuesta';
import { ErrorCarga, EtiquetaOperacion } from './piezas';
import { Boton } from '@/componentes/Boton';
import { useCarga } from '@/hooks/carga';
import { usePuntos } from '@/hooks/estado';
import { ETIQUETA_OPERACION } from '@/lib/nombres-operacion';
import {
  type EstadoModeracion,
  type PropuestaPanel,
  aprobarLote,
  cargarCola,
  cargarHistorial,
  coincide,
  lineaCola,
  rechazarLote,
  resumenLote,
  tieneAviso,
} from '@/lib/panel/cola';
import { textoError } from '@/lib/panel/errores';
import type { Operacion } from '@/lib/propuestas';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

const ESTADOS: { valor: EstadoModeracion; nombre: string }[] = [
  { valor: 'pendiente', nombre: T.panelCola.pendientes },
  { valor: 'aprobada', nombre: T.panelCola.aprobadas },
  { valor: 'rechazada', nombre: T.panelCola.rechazadas },
  { valor: 'retirada_por_autor', nombre: T.panelCola.retiradasPorAutor },
];

const OPERACIONES: Operacion[] = ['alta', 'revision', 'estado', 'datos', 'ubicacion', 'retirada'];

/** Cola de revisión (FR-100–FR-110, FL-21–FL-23): lista con filtros y casillas, y el detalle al lado. */
export default function ColaRevision({ alCambiar }: { alCambiar: () => void }) {
  const { busqueda, avisar } = usePanel();
  const { puntos } = usePuntos();
  const [estado, setEstado] = useState<EstadoModeracion>('pendiente');
  const [operacion, setOperacion] = useState<Operacion | ''>('');
  const [nucleo, setNucleo] = useState('');
  const [activa, setActiva] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [rechazoLote, setRechazoLote] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const detalle = useRef<HTMLDivElement>(null);

  const carga = useCarga(
    () => (estado === 'pendiente' ? cargarCola() : cargarHistorial(estado)),
    [estado],
    estado === 'pendiente' ? 60_000 : undefined,
  );
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
  const seleccion = visibles.find((p) => p.id === activa) ?? visibles[0] ?? null;
  const pendientes = estado === 'pendiente';
  const elegidas = visibles.filter((p) => marcadas.has(p.id));

  function cambiarEstado(e: EstadoModeracion) {
    setEstado(e);
    setMarcadas(new Set());
    setActiva(null);
    setRechazoLote(false);
  }

  function elegir(p: PropuestaPanel) {
    setActiva(p.id);
    // En tableta, el detalle va debajo de la lista: se lleva la vista hasta él.
    if (detalle.current && window.matchMedia('(max-width: 1023px)').matches) {
      detalle.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

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
    await carga.recargar();
  }

  const nombre = (id: string) => {
    const p = todas.find((x) => x.id === id);
    return p ? `${ETIQUETA_OPERACION[p.operacion]} ${p.codigo ?? T.panelCola.nuevo}` : id;
  };

  async function aprobarMarcadas() {
    setOcupado(true);
    const r = await aprobarLote(elegidas.map((p) => p.id));
    setOcupado(false);
    if (!r.ok) return avisar(textoError(r.codigo), 'error');
    setMarcadas(new Set());
    const omitidas = r.datos.some((x) => x.resultado === 'omitida');
    avisar(resumenLote(r.datos, nombre), omitidas ? 'error' : 'ok');
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
                disabled={!visibles.length}
                onChange={(e) => setMarcadas(new Set(e.target.checked ? visibles.map((p) => p.id) : []))}
                aria-label={T.panelCola.seleccionarTodas}
              />
              <span className={cn(elegidas.length ? 'text-texto font-semibold' : 'text-texto-suave')}>
                {elegidas.length ? T.panelCola.seleccionadas(elegidas.length) : T.panelCola.ningunaSeleccionada}
              </span>
            </label>
            <BotonBarra disabled={!elegidas.length || ocupado} onClick={() => void aprobarMarcadas()}>
              {T.panelCola.aprobarSeleccionadas}
            </BotonBarra>
            <BotonBarra disabled={!elegidas.length || ocupado} onClick={() => setRechazoLote(true)} className="ml-1">
              {T.panelCola.rechazarSeleccionadas}
            </BotonBarra>
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

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section
          aria-label={T.panelCola.colaRevision}
          className="border-linea bg-papel lg:w-[47%] lg:overflow-y-auto lg:border-r"
        >
          <Lista
            carga={carga}
            visibles={visibles}
            pendientes={pendientes}
            seleccion={seleccion}
            marcadas={marcadas}
            busqueda={busqueda}
            hayFiltro={!!operacion || !!nucleo}
            alElegir={elegir}
            alMarcar={marcar}
          />
        </section>
        <section
          ref={detalle}
          aria-label={
            seleccion
              ? `${seleccion.codigo ?? T.panelCola.nuevo} · ${ETIQUETA_OPERACION[seleccion.operacion]}`
              : undefined
          }
          className="border-linea bg-fondo flex-1 scroll-mt-2 border-t p-4 lg:overflow-y-auto lg:border-t-0"
        >
          {seleccion ? (
            <DetallePropuesta key={seleccion.id} p={seleccion} puntos={puntos} alHecho={() => void hecho()} />
          ) : (
            carga.estado !== 'cargando' && <p className="text-texto-suave text-sm">{T.panelCola.eligeUna}</p>
          )}
        </section>
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
  alElegir: (p: PropuestaPanel) => void;
  alMarcar: (id: string) => void;
}) {
  if (carga.estado === 'cargando' && !carga.datos) {
    return <p className="text-texto-suave p-4 text-sm">{T.panelCola.cargando}</p>;
  }
  if (carga.estado === 'error' && !carga.datos) {
    return <ErrorCarga codigo={carga.codigo} alReintentar={() => void carga.recargar()} />;
  }
  if (!visibles.length) {
    const texto = busqueda.trim()
      ? T.panelCola.busquedaVacia(busqueda.trim())
      : !pendientes
        ? T.panelCola.historialVacio
        : hayFiltro
          ? T.panelCola.filtroVacio
          : T.panelCola.colaVacia;
    return <p className="text-texto-suave p-6 text-center text-sm">{texto}</p>;
  }
  return (
    <ul>
      {visibles.map((p) => {
        const nombre = `${ETIQUETA_OPERACION[p.operacion]} ${p.codigo ?? T.panelCola.nuevo}`;
        const activa = p.id === seleccion?.id;
        return (
          <li
            key={p.id}
            className={cn(
              'border-linea flex items-start gap-2 border-b px-3 py-2',
              activa && 'bg-[#EFF3F8] shadow-[inset_3px_0_0_var(--marino-700)] dark:bg-white/5',
            )}
          >
            {pendientes && (
              <input
                type="checkbox"
                className="mt-1.5 size-4 shrink-0"
                checked={marcadas.has(p.id)}
                onChange={() => alMarcar(p.id)}
                aria-label={T.panelCola.seleccionar(nombre)}
              />
            )}
            <button
              type="button"
              onClick={() => alElegir(p)}
              aria-current={activa || undefined}
              className="min-h-11 flex-1 text-left"
            >
              <span className="flex items-center gap-1.5">
                <EtiquetaOperacion operacion={p.operacion} />
                <span className="font-datos text-texto-suave text-[13px]">{p.codigo ?? T.panelCola.nuevo}</span>
                {pendientes && tieneAviso(p) && (
                  <TriangleAlert size={14} className="text-ambar-700" aria-label={T.panelCola.senalAviso} />
                )}
              </span>
              <span className="text-texto-suave block text-[13px]">{lineaCola(p)}</span>
            </button>
          </li>
        );
      })}
    </ul>
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
  return (
    <div className="border-linea bg-papel border-b p-3 text-sm">
      <p className="font-semibold">{T.panelCola.rechazarVarias(n)}</p>
      <label className="mt-2 block">
        <span className="text-texto-suave text-[13px]">{T.panelCola.motivoComun}</span>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="border-linea rounded-campo mt-1 block w-full border p-2"
          rows={2}
        />
      </label>
      <p className="text-texto-suave mt-1 text-xs">{T.panelCola.avisoNombres}</p>
      {intentado && !motivo.trim() && <p className="text-rojo-700 mt-1 text-xs">{T.panelCola.sinMotivo}</p>}
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
