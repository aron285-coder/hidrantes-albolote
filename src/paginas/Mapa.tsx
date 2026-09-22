import { Layers, LocateFixed, Minus, Plus, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { BarraEstado } from '@/componentes/mapa/BarraEstado';
import { Ficha } from '@/componentes/mapa/Ficha';
import { Leyenda } from '@/componentes/mapa/Leyenda';
import { ListaPuntos } from '@/componentes/mapa/ListaPuntos';
import { type ControlMapa, MapaLeaflet } from '@/componentes/mapa/MapaLeaflet';
import { MarcadorSvg } from '@/componentes/mapa/MarcadorSvg';
import { SelectorCapas } from '@/componentes/mapa/SelectorCapas';
import { AvisoInstalar } from '@/componentes/AvisoInstalar';
import { BandaEntorno } from '@/componentes/BandaEntorno';
import { BarraSuperior } from '@/componentes/BarraSuperior';
import { useAcceso, useConexion, useMapabase, useModo, usePosicion, usePuntos } from '@/hooks/estado';
import { useAncho } from '@/hooks/ancho';
import { type Capa, NOMBRE_CAPA, atribucion, capaGuardada, enLinea, guardarCapa } from '@/lib/capas';
import { nombreCaudal } from '@/lib/ficha';
import { activarPosicion, posicionActual } from '@/lib/posicion';
import { rutaAltaEn } from '@/lib/propuestas';
import { esPruebas } from '@/lib/entorno';
import { buscar } from '@/lib/puntos';
import { T } from '@/lib/textos';

const Control = ({
  etiqueta,
  onClick,
  children,
}: {
  etiqueta: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={etiqueta}
    title={etiqueta}
    className="text-texto rounded-tarjeta flex size-11 items-center justify-center bg-[var(--control-mapa)] shadow-[0_1px_5px_rgba(0,0,0,.18)]"
  >
    {children}
  </button>
);

/**
 * Pantalla del mapa (FR-60–FR-71). El punto elegido va en `?p=`: en el móvil la ficha ocupa la
 * pantalla; desde tableta flota sobre el mapa; en ordenador, además, la lista va al lado (FR-70).
 */
export function Mapa() {
  const { puntos, guardadoEn } = usePuntos();
  const acceso = useAcceso();
  const conexion = useConexion();
  const mapabase = useMapabase();
  const modo = useModo();
  const estadoPos = usePosicion();
  const ancho = useAncho();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const seleccionado = params.get('p');
  const [capa, setCapa] = useState<Capa>(capaGuardada);
  const [menuCapas, setMenuCapas] = useState(false);
  const [texto, setTexto] = useState('');
  const control = useRef<ControlMapa>(null);

  const punto = useMemo(() => puntos.find((p) => p.id === seleccionado) ?? null, [puntos, seleccionado]);
  const resultados = useMemo(() => (texto ? buscar(puntos, texto).slice(0, 8) : []), [puntos, texto]);
  const pos = posicionActual();
  const sinRed = conexion === 'sin_cobertura';

  const elegir = useCallback(
    (id: string) => navegar(`/?p=${encodeURIComponent(id)}`, { replace: !!seleccionado }),
    [navegar, seleccionado],
  );
  const cerrarFicha = useCallback(() => navegar('/', { replace: true }), [navegar]);

  // Al elegir un punto (mapa, lista o búsqueda), el mapa lo centra.
  useEffect(() => {
    if (punto) control.current?.centrar(punto.lat, punto.lng);
  }, [punto]);

  // El botón "Mi posición" centra en cuanto llega la primera lectura.
  const centrarEnMi = useRef(false);
  useEffect(() => {
    if (centrarEnMi.current && pos) {
      control.current?.centrar(pos.lat, pos.lng, 16);
      centrarEnMi.current = false;
    }
  }, [pos]);

  // Sin cobertura, la capa elegida deja de pintarse y hay que decirlo (UI-04). También el Catastro,
  // aunque debajo siga el mapa base: si no, el plano de parcelas desaparece sin explicación.
  const avisoCapa =
    sinRed && enLinea(capa)
      ? T.mapa.capaSinCobertura(NOMBRE_CAPA[capa])
      : sinRed && !mapabase.descargado
        ? T.mapa.mapaNoDescargado
        : null;
  const avisoPosicion =
    estadoPos.tipo === 'denegada'
      ? T.mapa.posicionDenegada
      : estadoPos.tipo === 'no_disponible'
        ? T.mapa.posicionNoDisponible
        : estadoPos.tipo === 'buscando'
          ? T.mapa.buscandoPosicion
          : null;

  const ficha = punto && (
    <Ficha
      punto={punto}
      posicion={pos}
      guardadoEn={guardadoEn}
      alCerrar={cerrarFicha}
      conCabecera={ancho !== 'movil'}
    />
  );

  // Móvil: la ficha es una pantalla propia, con su barra y "volver".
  if (ficha && ancho === 'movil') {
    return (
      <div className="bg-fondo fixed inset-0 z-30 flex flex-col overflow-y-auto">
        {esPruebas && <BandaEntorno />}
        <BarraSuperior titulo={punto.codigo} alVolver={cerrarFicha} jefatura={acceso.tipo === 'jefatura'} />
        <div className="p-3">{ficha}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BarraEstado />
      <AvisoInstalar />
      <div className="relative flex min-h-0 flex-1">
        {ancho === 'escritorio' && (
          <aside className="border-linea bg-fondo flex w-80 shrink-0 flex-col border-r">
            <ListaPuntos alElegir={elegir} />
          </aside>
        )}
        <div className="relative isolate min-h-[60vh] flex-1">
          <MapaLeaflet
            ref={control}
            puntos={puntos}
            seleccionado={seleccionado}
            capa={capa}
            modo={modo}
            posicion={pos}
            alSeleccionar={elegir}
            alPulsacionLarga={(lat, lng) => navegar(rutaAltaEn(lat, lng))}
          />

          {/* Búsqueda (FR-69) */}
          {ancho !== 'escritorio' && (
            <div className="absolute inset-x-2 top-2 z-[500]">
              <label className="rounded-tarjeta flex min-h-11 items-center gap-2 bg-[var(--control-mapa)] px-2.5 shadow-[0_1px_5px_rgba(0,0,0,.18)]">
                <Search size={18} className="text-texto-suave shrink-0" aria-hidden />
                <input
                  type="search"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder={T.mapa.buscar}
                  aria-label={T.mapa.buscar}
                  className="min-w-0 flex-1 bg-transparent outline-none"
                />
                {texto && (
                  <button
                    type="button"
                    onClick={() => setTexto('')}
                    aria-label={T.mapa.borrarBusqueda}
                    className="-mr-2 flex size-11 items-center justify-center"
                  >
                    <X size={18} aria-hidden />
                  </button>
                )}
              </label>
              {texto && (
                <ul className="bg-papel rounded-tarjeta mt-1 max-h-72 overflow-y-auto shadow-lg">
                  {resultados.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setTexto('');
                          elegir(p.id);
                        }}
                        className="border-linea flex min-h-11 w-full items-center gap-2 border-b px-2.5 text-left text-sm"
                      >
                        <MarcadorSvg punto={p} tamano={20} />
                        <span className="truncate">
                          <b className="font-datos">{p.codigo}</b> · {p.direccion ?? T.ficha.sinDireccion} ·{' '}
                          {nombreCaudal[p.caudal]}
                        </span>
                      </button>
                    </li>
                  ))}
                  {resultados.length === 0 && <li className="text-texto-suave p-3 text-sm">{T.mapa.busquedaVacia}</li>}
                </ul>
              )}
            </div>
          )}

          {/* Capas, mi posición y zoom: columna derecha (tableta: botones laterales) */}
          <div
            className={`absolute right-2 z-[400] flex flex-col gap-2 ${ancho === 'escritorio' ? 'top-2' : 'top-16'}`}
          >
            <Control etiqueta={T.mapa.capas} onClick={() => setMenuCapas(true)}>
              <Layers size={20} aria-hidden />
            </Control>
            <Control
              etiqueta={T.mapa.miPosicion}
              onClick={() => {
                activarPosicion();
                if (pos) control.current?.centrar(pos.lat, pos.lng, 16);
                else centrarEnMi.current = true;
              }}
            >
              <LocateFixed size={20} aria-hidden />
            </Control>
            <Control etiqueta={T.mapa.acercar} onClick={() => control.current?.acercar()}>
              <Plus size={20} aria-hidden />
            </Control>
            <Control etiqueta={T.mapa.alejar} onClick={() => control.current?.alejar()}>
              <Minus size={20} aria-hidden />
            </Control>
          </div>

          {(avisoCapa || avisoPosicion) && (
            <p
              role="status"
              className="bg-oro-100 border-oro-600 text-ambar-700 rounded-tarjeta absolute inset-x-2 top-16 z-[450] mr-14 border px-2.5 py-1.5 text-[13px]"
            >
              {avisoPosicion ?? avisoCapa}
            </p>
          )}

          {puntos.length === 0 && (
            <p className="bg-papel rounded-tarjeta text-texto-suave absolute inset-x-6 top-1/2 z-[450] p-3 text-center text-sm shadow">
              {T.mapa.sinPuntos}
            </p>
          )}

          {/* Nuevo punto (FL-03): botón + naranja de 44 px en la esquina inferior derecha (06 §5) */}
          <button
            type="button"
            onClick={() => navegar('/proponer/alta')}
            aria-label={T.navegacion.nuevoPunto}
            title={T.navegacion.nuevoPunto}
            className="bg-naranja-600 absolute right-3 bottom-8 z-[450] flex size-14 items-center justify-center rounded-full text-white shadow-lg"
          >
            <Plus size={28} aria-hidden />
          </button>

          <div className="absolute bottom-2 left-2 z-[400]">
            <Leyenda />
          </div>
          <p className="text-texto-suave absolute right-1 bottom-0.5 z-[400] rounded bg-[var(--control-mapa)] px-1 text-[10px]">
            {atribucion(capa)}
          </p>

          {ficha && (
            <aside className="bg-fondo rounded-tarjeta absolute top-2 right-16 z-[600] max-h-[calc(100%-1rem)] w-[min(360px,calc(100%-5rem))] overflow-y-auto p-3 shadow-xl">
              {ficha}
            </aside>
          )}
          {seleccionado && !punto && puntos.length > 0 && (
            <p className="bg-papel rounded-tarjeta absolute inset-x-6 top-1/3 z-[600] p-3 text-center shadow">
              {T.ficha.noEncontrado}
            </p>
          )}
        </div>
      </div>

      {menuCapas && (
        <SelectorCapas
          titulo={T.mapa.capas}
          actual={capa}
          alElegir={(c) => {
            setCapa(c);
            guardarCapa(c);
          }}
          alCerrar={() => setMenuCapas(false)}
        />
      )}
    </div>
  );
}
