import { Crosshair, Layers, LocateFixed, Minus, Plus, Ruler, Search, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { BarraEstado } from '@/componentes/mapa/BarraEstado';
import { Ficha } from '@/componentes/mapa/Ficha';
import { Leyenda } from '@/componentes/mapa/Leyenda';
import { ListaPuntos } from '@/componentes/mapa/ListaPuntos';
import { type ControlMapa, MapaLeaflet } from '@/componentes/mapa/MapaLeaflet';
import { MarcadorSvg } from '@/componentes/mapa/MarcadorSvg';
import {
  CabeceraGrupo,
  ResultadoCoordenadas,
  ResultadosCallesYDirecciones,
} from '@/componentes/mapa/ResultadosLugares';
import { BarraMedicion } from '@/componentes/mapa/BarraMedicion';
import { PanelCercanos } from '@/componentes/mapa/PanelCercanos';
import { QueHayAqui } from '@/componentes/mapa/QueHayAqui';
import { leerLatLng, parametroLatLng } from '@/lib/coordenadas';
import { SelectorCapas } from '@/componentes/mapa/SelectorCapas';
import { AvisoInstalar } from '@/componentes/AvisoInstalar';
import { BandaEntorno } from '@/componentes/BandaEntorno';
import { BarraSuperior } from '@/componentes/BarraSuperior';
import { useAcceso, useConexion, useMapabase, useModo, usePosicion, usePuntos } from '@/hooks/estado';
import { useAncho } from '@/hooks/ancho';
import { type Destino, hayLugares, useBusquedaLugares, useIrADestino } from '@/hooks/busqueda';
import { type Enfoque, calleResaltada } from '@/lib/callejero';
import { type Capa, NOMBRE_CAPA, atribucion, baseDebajo, capaGuardada, enLinea, guardarCapa } from '@/lib/capas';
import { nombreCaudal } from '@/lib/ficha';
import { megas } from '@/lib/formato';
import { BYTES_MAPABASE, descargarMapabase, hayVersionNuevaMapabase } from '@/lib/mapabase';
import { escribir } from '@/lib/almacen';
import { FRACCION_HOJA, alturaHoja } from '@/lib/hoja-cercanos';
import { cercanos, leerGps, masCercanoQueNoFunciona, origenViejo, parametroGps } from '@/lib/incidente';
import { anadir, borrar as borrarMedicion, deshacer, resumen as resumenMedicion } from '@/lib/medicion';
import {
  type Posicion,
  activarPosicion,
  esAntigua,
  estadoPosicion,
  posicionActual,
  suscribirPosicion,
} from '@/lib/posicion';
import { esPruebas } from '@/lib/entorno';
import { buscar, metrosTramoManguera } from '@/lib/puntos';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

type LatLngMedida = { lat: number; lng: number };

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
/** Lo que tapa la ficha flotante por la derecha: 360 px de ancho, a 64 px del borde, y 8 de aire. */
const MARGEN_FICHA_PX = 360 + 64 + 8;

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
  const aquiParam = params.get('aqui');
  const aqui = useMemo(() => leerLatLng(aquiParam), [aquiParam]);
  // Modo incidente (FR-74): el incidente va en la URL, así *atrás* lo cierra y una recarga lo mantiene.
  const incidenteParam = params.get('incidente');
  const incidente = useMemo(() => leerLatLng(incidenteParam), [incidenteParam]);
  // Con el GPS de origen, su momento y su precisión (RV-59); `gps=1` es de la versión anterior.
  const gpsParam = params.get('gps');
  const origenGps = useMemo(() => leerGps(gpsParam), [gpsParam]);
  const desdeGps = origenGps !== null;
  const sufijoGps = gpsParam !== null ? `&gps=${gpsParam}` : '';
  const [sinPosicion, setSinPosicion] = useState(false);
  // "Cercanos" con el GPS en frío: la hoja espera al primer fix en vez de decir "Sin posición" (RV-59).
  const [esperandoFix, setEsperandoFix] = useState(false);
  const esperaFix = useRef<(() => void) | null>(null);
  const dejarDeEsperar = () => {
    esperaFix.current?.();
    esperaFix.current = null;
    setEsperandoFix(false);
  };
  useEffect(() => () => esperaFix.current?.(), []);
  const [soloHidrantes, setSoloHidrantes] = useState(false);
  const buscador = useRef<HTMLInputElement>(null);
  // Medición (FR-76): en la URL (`?medir=1`) para que *atrás* salga; los vértices, en memoria, y los
  // de partida llegan en el estado de la navegación ("Medir desde aquí", "Medir tendido").
  const ubicacion = useLocation();
  const midiendo = params.get('medir') === '1';
  const verticesIniciales = (ubicacion.state as { vertices?: LatLngMedida[] } | null)?.vertices;
  const [vertices, setVertices] = useState<LatLngMedida[]>(() => verticesIniciales ?? []);
  const [claveMedicion, setClaveMedicion] = useState(ubicacion.key);
  if (midiendo && claveMedicion !== ubicacion.key) {
    // Una medición nueva (otra entrada al modo): se empieza con sus vértices de partida.
    setClaveMedicion(ubicacion.key);
    setVertices(verticesIniciales ?? []);
  }
  const terminarMedicion = () => {
    if (ubicacion.key !== 'default') navegar(-1);
    else navegar('/', { replace: true });
  };
  const [capa, setCapa] = useState<Capa>(capaGuardada);
  const [menuCapas, setMenuCapas] = useState(false);
  const [texto, setTexto] = useState('');
  const control = useRef<ControlMapa>(null);

  const punto = useMemo(() => puntos.find((p) => p.id === seleccionado) ?? null, [puntos, seleccionado]);
  const resultados = useMemo(() => (texto ? buscar(puntos, texto).slice(0, 8) : []), [puntos, texto]);
  // En ordenador busca la lista de al lado; aquí, solo la búsqueda flotante del móvil y la tableta.
  const lugares = useBusquedaLugares(ancho !== 'escritorio' ? texto : '');
  const irADestino = useIrADestino();
  /** Elegir cualquier resultado de la búsqueda deja atrás el "Sin posición" (docs/19 RV-62). */
  const olvidarSinPosicion = () => {
    setSinPosicion(false);
    esperaFix.current?.();
    esperaFix.current = null;
    setEsperandoFix(false);
  };
  const irA = (d: Destino) => {
    setTexto('');
    olvidarSinPosicion();
    irADestino(d);
  };
  const conLugares = hayLugares(lugares);
  const pos = posicionActual();
  // La ficha flota a la derecha desde la tableta (360 px a 64 px del borde, más 8 de aire).
  const fichaAlLado = !!seleccionado && ancho !== 'movil';
  const sinRed = conexion === 'sin_cobertura';

  const candidatos = useMemo(
    () => (incidente ? cercanos(puntos, incidente, { soloHidrantes, metrosTramo: metrosTramoManguera() }) : []),
    [puntos, incidente, soloHidrantes],
  );
  const avisoCercano = useMemo(
    () => (incidente ? masCercanoQueNoFunciona(puntos, incidente, { soloHidrantes }, candidatos) : null),
    [puntos, incidente, soloHidrantes, candidatos],
  );
  // Una ficha abierta desde el incidente lo recuerda en el estado de la navegación: al cerrarla se
  // vuelve atrás, y no quedan dos entradas iguales del incidente (docs/19 RV-62).
  const desdeIncidente = (ubicacion.state as { desdeIncidente?: boolean } | null)?.desdeIncidente === true;
  const elegir = useCallback(
    (id: string) =>
      navegar(
        incidenteParam
          ? `/?incidente=${incidenteParam}${sufijoGps}&p=${encodeURIComponent(id)}`
          : `/?p=${encodeURIComponent(id)}`,
        {
          replace: !!seleccionado,
          state: incidenteParam && (!seleccionado || desdeIncidente) ? { desdeIncidente: true } : undefined,
        },
      ),
    [navegar, seleccionado, incidenteParam, sufijoGps, desdeIncidente],
  );
  const cerrarFicha = useCallback(() => {
    if (desdeIncidente) return navegar(-1);
    // Con un incidente abierto, cerrar la ficha vuelve al incidente.
    navegar(incidenteParam ? `/?incidente=${incidenteParam}${sufijoGps}` : '/', { replace: true });
  }, [navegar, incidenteParam, sufijoGps, desdeIncidente]);
  const cerrarIncidente = useCallback(() => {
    setSinPosicion(false);
    esperaFix.current?.();
    esperaFix.current = null;
    setEsperandoFix(false);
    navegar('/', { replace: true });
  }, [navegar]);
  const abrirDesdeGps = (p: Posicion) =>
    navegar(`/?incidente=${parametroLatLng(p)}&gps=${parametroGps(p)}`, { replace: !!incidenteParam });
  /** Sin posición de verdad (denegada o no disponible): se explica y se ofrece la búsqueda (UI-02). */
  const mostrarSinPosicion = () => {
    dejarDeEsperar();
    setSinPosicion(true);
    buscador.current?.focus();
    document.getElementById('buscar-lista')?.focus();
  };
  /**
   * "Cercanos": desde tu posición (FR-74). Mientras el GPS busca, la hoja lo dice sin enfocar el
   * buscador (el teclado taparía la explicación) y el incidente se abre solo con el primer fix (RV-59).
   */
  const pedirCercanos = () => {
    activarPosicion();
    if (pos) {
      setSinPosicion(false);
      dejarDeEsperar();
      abrirDesdeGps(pos);
    } else if (estadoPosicion().tipo === 'buscando') {
      setSinPosicion(false);
      setEsperandoFix(true);
      esperaFix.current?.();
      esperaFix.current = suscribirPosicion(() => {
        const e = estadoPosicion();
        if (e.tipo === 'ok') {
          dejarDeEsperar();
          abrirDesdeGps(e.posicion);
        } else if (e.tipo === 'denegada' || e.tipo === 'no_disponible') mostrarSinPosicion();
      });
    } else mostrarSinPosicion();
  };
  const elegirCandidato = (id: string) =>
    navegar(`/?incidente=${incidenteParam}${sufijoGps}&p=${encodeURIComponent(id)}`, {
      state: { desdeIncidente: true },
    });
  // "¿Qué hay aquí?" va en la URL: *atrás* la cierra (FR-72).
  const abrirAqui = useCallback(
    (lat: number, lng: number) => {
      setSinPosicion(false);
      esperaFix.current?.();
      esperaFix.current = null;
      setEsperandoFix(false);
      navegar(`/?aqui=${parametroLatLng({ lat, lng })}`, { replace: !!aquiParam });
    },
    [navegar, aquiParam],
  );

  // Al elegir un punto (mapa, lista o búsqueda), el mapa lo centra. Con un incidente abierto, no: el
  // encuadre del incidente ya deja ver el incidente y los candidatos junto a la ficha (RV-60).
  useEffect(() => {
    if (punto && !incidente) control.current?.centrar(punto.lat, punto.lng);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar el punto elegido
  }, [punto]);

  // Al llegar desde un resultado de la búsqueda (FR-73): un sitio se centra a z18; una calle, se encuadra.
  const enfoque = (ubicacion.state as { enfoque?: Enfoque } | null)?.enfoque;
  useEffect(() => {
    if (enfoque?.recuadro) {
      control.current?.encuadrar(enfoque.recuadro, ancho === 'movil' ? Math.round(window.innerHeight * 0.4) : 0);
    } else if (enfoque?.centro) control.current?.centrar(enfoque.centro.lat, enfoque.centro.lng, 18);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una vez por navegación
  }, [ubicacion.key]);

  // El botón "Mi posición" centra en cuanto llega la primera lectura.
  const centrarEnMi = useRef(false);
  useEffect(() => {
    if (centrarEnMi.current && pos) {
      control.current?.centrar(pos.lat, pos.lng, 16);
      centrarEnMi.current = false;
    }
  }, [pos]);

  // Sin cobertura, la capa elegida deja de pintarse y hay que decirlo (UI-04). También el Catastro,
  // aunque debajo siga el mapa base: si no, el plano de parcelas desaparece sin explicación. Con el
  // mapa base en el móvil, se pinta debajo y el aviso lo dice (RV-58).
  const avisoCapa =
    sinRed && enLinea(capa)
      ? mapabase.descargado
        ? T.mapa.capaConBaseDebajo(NOMBRE_CAPA[capa])
        : T.mapa.capaSinCobertura(NOMBRE_CAPA[capa])
      : sinRed && !mapabase.descargado
        ? T.mapa.mapaNoDescargado
        : null;
  // Los avisos flotantes dejan libre la columna de botones: su ancho, medido, más 8 px (RV-59).
  const columna = useRef<HTMLDivElement>(null);
  const [anchoColumna, setAnchoColumna] = useState(0);
  useLayoutEffect(() => {
    const c = columna.current;
    if (!c) return;
    const medir = () => setAnchoColumna(c.offsetWidth);
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const o = new ResizeObserver(medir);
    o.observe(c);
    return () => o.disconnect();
  }, []);
  const avisoPosicion =
    estadoPos.tipo === 'denegada'
      ? T.mapa.posicionDenegada
      : estadoPos.tipo === 'no_disponible'
        ? T.mapa.posicionNoDisponible
        : estadoPos.tipo === 'buscando' && !esperandoFix
          ? T.mapa.buscandoPosicion
          : null;

  // "Cercanos" (FR-74): abajo en el móvil y la tableta; en ordenador, en la columna de la lista, con
  // "Volver a la lista" (docs/19 RV-60). Un incidente nuevo vuelve a enseñar Cercanos.
  const hayCercanos = !midiendo && (!!incidente || ((sinPosicion || esperandoFix) && !aqui));
  const [listaEnColumna, setListaEnColumna] = useState(false);
  const [incidenteVisto, setIncidenteVisto] = useState(incidenteParam);
  if (incidenteParam !== incidenteVisto) {
    setIncidenteVisto(incidenteParam);
    setListaEnColumna(false);
  }
  /** "Marcar en el mapa" (RV-59): cierra la hoja y deja el mapa sobre el sitio, listo para la pulsación larga. */
  const marcarEnMapa = () => {
    const o = incidente;
    cerrarIncidente();
    if (o) control.current?.centrar(o.lat, o.lng, 17);
  };
  const panelCercanos = (variante: 'hoja' | 'columna') => (
    <PanelCercanos
      estado={{
        origen: incidente,
        desdeGps,
        buscando: esperandoFix,
        precision: origenGps?.precision ?? null,
        momento: origenGps?.momento ?? null,
        // Con el momento en la URL, el del origen; con `gps=1`, como antes, el del GPS de ahora.
        posicionVieja:
          origenGps?.momento != null
            ? origenViejo(origenGps)
            : desdeGps && pos && esAntigua(pos)
              ? (pos.momento ?? null)
              : null,
        candidatos,
        aviso: avisoCercano,
        soloHidrantes,
        guardadoEn,
      }}
      variante={variante}
      dejarSitioFicha={variante === 'hoja' && fichaAlLado}
      alVolverALista={variante === 'columna' ? () => setListaEnColumna(true) : undefined}
      alCerrar={cerrarIncidente}
      alMarcarEnMapa={marcarEnMapa}
      alCambiarSoloHidrantes={setSoloHidrantes}
      alElegir={elegirCandidato}
      alMedir={(hasta) =>
        navegar('/?medir=1', { state: { vertices: [incidente!, { lat: hasta.lat, lng: hasta.lng }] } })
      }
      alVerLista={() => {
        escribir('orden_lista', 'distancia');
        // El incidente viaja en la URL: la lista ordena desde él (RV-62).
        navegar(`/lista?incidente=${incidenteParam}`);
      }}
    />
  );

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
            {hayCercanos && incidente && !listaEnColumna ? (
              panelCercanos('columna')
            ) : (
              <>
                {/* Sin posición o buscándola: el aviso encima de la lista, que tiene la búsqueda. */}
                {hayCercanos && !incidente && panelCercanos('columna')}
                {hayCercanos && incidente && (
                  <button
                    type="button"
                    onClick={() => setListaEnColumna(false)}
                    className="bg-papel border-texto text-texto rounded-boton mx-3 mt-2 flex min-h-11 items-center justify-center gap-2 border-[1.5px] px-3 text-[14px] font-semibold"
                  >
                    <Crosshair size={16} aria-hidden />
                    {T.incidente.volverACercanos}
                  </button>
                )}
                <ListaPuntos
                  alElegir={(id) => {
                    olvidarSinPosicion();
                    elegir(id);
                  }}
                  alElegirLugar={olvidarSinPosicion}
                />
              </>
            )}
          </aside>
        )}
        <div className="relative isolate min-h-[60vh] flex-1">
          <MapaLeaflet
            ref={control}
            puntos={puntos}
            seleccionado={seleccionado}
            capa={capa}
            baseDebajo={baseDebajo(conexion, mapabase.descargado !== null)}
            modo={modo}
            posicion={pos}
            alSeleccionar={elegir}
            alPulsacionLarga={midiendo ? undefined : abrirAqui}
            aqui={midiendo ? null : aqui}
            calle={calleResaltada()?.g ?? null}
            medicion={
              midiendo
                ? {
                    vertices,
                    etiquetas: resumenMedicion(vertices, metrosTramoManguera()).etiquetas,
                    alTocar: (l) => setVertices((v) => anadir(v, l)),
                  }
                : null
            }
            incidente={
              incidente
                ? {
                    origen: incidente,
                    candidatos: candidatos.map((c) => c.punto),
                    // La hoja de abajo (móvil y tableta) y la ficha flotante a la derecha (RV-60).
                    margenInferior:
                      ancho !== 'escritorio' ? Math.round(window.innerHeight * FRACCION_HOJA[alturaHoja()]) : 0,
                    margenDerecho: fichaAlLado ? MARGEN_FICHA_PX : 0,
                  }
                : null
            }
          />

          {/* Búsqueda (FR-69) */}
          {ancho !== 'escritorio' && (
            <div className="absolute inset-x-2 top-2 z-[500]">
              <label className="rounded-tarjeta flex min-h-11 items-center gap-2 bg-[var(--control-mapa)] px-2.5 shadow-[0_1px_5px_rgba(0,0,0,.18)]">
                <Search size={18} className="text-texto-suave shrink-0" aria-hidden />
                <input
                  ref={buscador}
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
                <div className="bg-papel rounded-tarjeta mt-1 max-h-72 overflow-y-auto shadow-lg">
                  <ResultadoCoordenadas lugares={lugares} alElegir={irA} />
                  {resultados.length > 0 && (
                    <div role="group" aria-label={T.busqueda.puntos}>
                      {conLugares && <CabeceraGrupo titulo={T.busqueda.puntos} />}
                      <ul>
                        {resultados.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setTexto('');
                                olvidarSinPosicion();
                                elegir(p.id);
                              }}
                              className="border-linea flex min-h-13 w-full items-center gap-2 border-b px-2.5 text-left text-sm"
                            >
                              <MarcadorSvg punto={p} tamano={20} />
                              <span className="truncate">
                                <b className="font-datos">{p.codigo}</b> · {p.direccion ?? T.ficha.sinDireccion} ·{' '}
                                {nombreCaudal[p.caudal]}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <ResultadosCallesYDirecciones lugares={lugares} alElegir={irA} />
                  {resultados.length === 0 && !conLugares && (
                    <p className="text-texto-suave p-3 text-sm">{T.mapa.busquedaVacia}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Capas, mi posición y zoom: columna derecha (tableta: botones laterales). Con los resultados de
              la búsqueda abiertos se quita: la lista la taparía a medias (06 §9, tamaño de los objetivos). */}
          <div
            ref={columna}
            hidden={!!texto && ancho !== 'escritorio'}
            className={`absolute right-2 z-[400] flex flex-col gap-2 ${ancho === 'escritorio' ? 'top-2' : 'top-16'}`}
          >
            <Control etiqueta={T.mapa.capas} onClick={() => setMenuCapas(true)}>
              <Layers size={20} aria-hidden />
            </Control>
            {/* Medir (FR-76): junto a las capas, en las herramientas del mapa. Midiendo ya, sobra: la barra
                tiene "Terminar" (UI-01). */}
            {!midiendo && (
              <Control etiqueta={T.medir.boton} onClick={() => navegar('/?medir=1', { state: { vertices: [] } })}>
                <Ruler size={20} aria-hidden />
              </Control>
            )}
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
            {/* Cercanos (FR-74): con texto visible en el móvil, junto a "centrar en mí" (06 §4.7). */}
            <button
              type="button"
              onClick={pedirCercanos}
              aria-label={T.incidente.boton}
              className="text-texto rounded-tarjeta flex min-h-11 items-center justify-center gap-1 self-end bg-[var(--control-mapa)] px-2.5 text-[13px] font-semibold shadow-[0_1px_5px_rgba(0,0,0,.18)]"
            >
              <Crosshair size={20} aria-hidden />
              <span>{T.incidente.boton}</span>
            </button>
            <Control etiqueta={T.mapa.acercar} onClick={() => control.current?.acercar()}>
              <Plus size={20} aria-hidden />
            </Control>
            <Control etiqueta={T.mapa.alejar} onClick={() => control.current?.alejar()}>
              <Minus size={20} aria-hidden />
            </Control>
          </div>

          <div
            data-testid="avisos-mapa"
            className="absolute top-16 left-2 z-[450] flex flex-col gap-1.5"
            // right-2 de la columna + su ancho + 8 px de aire (RV-59).
            style={{ right: anchoColumna ? anchoColumna + 16 : 64 }}
          >
            {(avisoCapa || avisoPosicion) && (
              <p
                role="status"
                className="bg-oro-100 border-oro-600 text-ambar-700 rounded-tarjeta border px-2.5 py-1.5 text-[13px]"
              >
                {avisoPosicion ?? avisoCapa}
              </p>
            )}
            {/* El aviso de la capa sin cobertura manda: ya incluye el del mapa base (FR-81). */}
            {!avisoCapa && <AvisoMapabase sinRed={sinRed} />}
          </div>

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
          {aqui && !ficha && !midiendo && <QueHayAqui l={aqui} alCerrar={cerrarFicha} enHoja={ancho === 'movil'} />}
          {midiendo && (
            <BarraMedicion
              vertices={vertices}
              metrosTramo={metrosTramoManguera()}
              alDeshacer={() => setVertices(deshacer)}
              alBorrar={() => setVertices(borrarMedicion())}
              alTerminar={terminarMedicion}
            />
          )}
          {hayCercanos && ancho !== 'escritorio' && panelCercanos('hoja')}
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

/**
 * FR-81: si falta el mapa base, el mapa lo avisa al arrancar, con red o sin ella, y ofrece
 * descargarlo; una versión nueva también se ofrece aquí, no solo en Ajustes (RV-10). Con datos
 * móviles no se descarga sin preguntar: el botón es la pregunta.
 */
/** "Ocultar" el aviso de versión nueva vale para toda la sesión, no solo mientras se ve el mapa. */
let versionNuevaOculta = false;

function AvisoMapabase({ sinRed }: { sinRed: boolean }) {
  const mapabase = useMapabase();
  const [oculto, setOculto] = useState(versionNuevaOculta);
  const clase = 'bg-oro-100 border-oro-600 text-ambar-700 rounded-tarjeta border px-2.5 py-1.5 text-[13px]';
  const nueva = hayVersionNuevaMapabase(mapabase);
  if (mapabase.descargado && (!nueva || oculto)) return null;
  if (!mapabase.descargado && sinRed) {
    return (
      <p role="status" className={clase}>
        {T.mapa.mapaNoDescargado}
      </p>
    );
  }
  // Mientras descarga, el botón se cambia por el progreso: nunca un botón deshabilitado sin motivo (UI-02).
  const accion =
    mapabase.progreso !== null ? (
      <span className="font-semibold">{T.ajustes.descargando(mapabase.progreso)}</span>
    ) : (
      <button type="button" className="min-h-11 font-semibold underline" onClick={() => void descargarMapabase()}>
        {mapabase.descargado ? T.mapa.descargarVersionNueva : T.mapa.descargarMapabase(megas(BYTES_MAPABASE))}
      </button>
    );
  return (
    <div role="status" className={cn(clase, 'flex flex-wrap items-center gap-x-3')} data-testid="aviso-mapabase">
      <span className="flex-1">{mapabase.descargado ? T.ajustes.versionNuevaMapa : T.mapa.mapabaseFalta}</span>
      {accion}
      {mapabase.fallo && <span className="text-rojo-700 w-full">{T.ajustes.falloDescarga}</span>}
      {mapabase.descargado && mapabase.progreso === null && (
        <button
          type="button"
          aria-label={T.mapa.ocultarAviso}
          title={T.mapa.ocultarAviso}
          onClick={() => {
            versionNuevaOculta = true;
            setOculto(true);
          }}
          className="-mr-2 flex size-11 items-center justify-center"
        >
          <X size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}
