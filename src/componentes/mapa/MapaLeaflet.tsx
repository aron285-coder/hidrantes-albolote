import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { LIMITES, capasDe } from './capas-leaflet';
import { type Capa, ZOOM_MAX } from '@/lib/capas';
import type { LatLng } from '@/lib/coordenadas';
import { type Posicion, esAntigua } from '@/lib/posicion';
import type { Punto } from '@/lib/puntos';
import { detectorPulsacionLarga } from '@/lib/pulsacion-larga';
import { distancia } from '@/lib/formato';
import { desplazamientoEtiqueta, imantar } from '@/lib/medicion';
import { svgMarcador, visibleEnZoom } from '@/lib/simbologia';
import { T } from '@/lib/textos';
import { guardarVista, vistaGuardada } from '@/lib/vista';

export interface ControlMapa {
  centrar(lat: number, lng: number, zoom?: number): void;
  /** Encuadra un recuadro [[sur, oeste], [norte, este]] sin que lo tapen la búsqueda ni la hoja. */
  encuadrar(recuadro: [[number, number], [number, number]], margenInferior?: number): void;
  acercar(): void;
  alejar(): void;
}

interface Props {
  puntos: Punto[];
  seleccionado: string | null;
  capa: Capa;
  /** El mapa base propio debajo de la capa en línea (sin cobertura, RV-58). */
  baseDebajo?: boolean;
  modo: 'claro' | 'oscuro';
  posicion: Posicion | null;
  alSeleccionar: (id: string) => void;
  /** Pulsación larga (o clic derecho) sobre el mapa: abre "¿Qué hay aquí?" (FR-72, DEC-089). */
  alPulsacionLarga?: (lat: number, lng: number) => void;
  /** El sitio de "¿Qué hay aquí?", con su pin soltado (06 §4.7). */
  aqui?: LatLng | null;
  /** Modo incidente (FR-74): la diana y los candidatos, a los que se trazan líneas discontinuas. */
  incidente?: {
    origen: LatLng;
    candidatos: LatLng[];
    /** Lo que tapan la hoja de abajo y la ficha de la derecha, para encuadrar sin ellas (RV-60). */
    margenInferior?: number;
    margenDerecho?: number;
  } | null;
  /**
   * Medición (FR-76): mientras está activa, un toque añade un vértice y no abre fichas; cerca de un
   * marcador (≤ 44 px) se imanta a él.
   */
  medicion?: {
    vertices: LatLng[];
    etiquetas: { en: LatLng; desde: LatLng; hasta: LatLng; metros: number }[];
    alTocar: (l: LatLng) => void;
  } | null;
  /** La calle elegida en la búsqueda, resaltada durante la sesión (FR-73, 06 §4.7): [[[lng, lat], …], …]. */
  calle?: [number, number][][] | null;
}

/** Diana del incidente: el Crosshair de lucide sobre un círculo de papel con borde (06 §4.7). */
const SVG_DIANA =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">' +
  '<circle cx="16" cy="16" r="15" fill="var(--papel)" stroke="var(--anillo-seleccion)" stroke-width="2"/>' +
  '<g transform="translate(4 4)" fill="none" stroke="var(--anillo-seleccion)" stroke-width="2" stroke-linecap="round">' +
  '<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/>' +
  '<line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/></g></svg>';

/** Pin soltado de "¿Qué hay aquí?": el MapPin de lucide en --anillo-seleccion (06 §4.7). */
const SVG_AQUI =
  '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="var(--papel)" ' +
  'stroke="var(--anillo-seleccion)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>' +
  '<circle cx="12" cy="10" r="3"/></svg>';

/** Mapa de Leaflet con el mapa base propio, las capas en línea, el límite, los puntos y tu posición. */
export const MapaLeaflet = forwardRef<ControlMapa, Props>(function MapaLeaflet(
  {
    puntos,
    seleccionado,
    capa,
    baseDebajo = false,
    modo,
    posicion,
    alSeleccionar,
    alPulsacionLarga,
    aqui = null,
    incidente = null,
    medicion = null,
    calle = null,
  },
  ref,
) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const grupoPuntos = useRef<L.LayerGroup | null>(null);
  const grupoPosicion = useRef<L.LayerGroup | null>(null);
  const grupoMarcas = useRef<L.LayerGroup | null>(null);
  const grupoIncidente = useRef<L.LayerGroup | null>(null);
  const alSeleccionarRef = useRef(alSeleccionar);
  useEffect(() => {
    alSeleccionarRef.current = alSeleccionar;
  }, [alSeleccionar]);
  const medicionRef = useRef(medicion);
  useEffect(() => {
    medicionRef.current = medicion;
  }, [medicion]);
  const grupoMedicion = useRef<L.LayerGroup | null>(null);
  const grupoCalle = useRef<L.LayerGroup | null>(null);
  const alPulsacionLargaRef = useRef(alPulsacionLarga);
  useEffect(() => {
    alPulsacionLargaRef.current = alPulsacionLarga;
  }, [alPulsacionLarga]);

  // Crear el mapa una vez.
  useEffect(() => {
    if (!contenedor.current) return;
    const m = L.map(contenedor.current, {
      zoomControl: false,
      attributionControl: false,
      minZoom: 10,
      maxZoom: ZOOM_MAX,
      maxBounds: LIMITES.pad(0.5),
      maxBoundsViscosity: 0.8,
    });
    const v = vistaGuardada();
    if (v) m.setView(v.centro, v.zoom);
    else m.fitBounds(LIMITES, { padding: [8, 8] });
    // El zoom de ahora, a la vista en el contenedor: la vista guardada no vale para saberlo con un
    // incidente o "¿Qué hay aquí?" abiertos, porque entonces no se guarda (RV-62).
    const anotarZoom = () => (m.getContainer().dataset.zoom = String(m.getZoom()));
    anotarZoom();
    m.on('moveend', () => {
      anotarZoom();
      guardarVista(m.getCenter(), m.getZoom());
    });
    grupoCalle.current = L.layerGroup().addTo(m);
    grupoPuntos.current = L.layerGroup().addTo(m);
    grupoPosicion.current = L.layerGroup().addTo(m);
    grupoIncidente.current = L.layerGroup().addTo(m);
    grupoMedicion.current = L.layerGroup().addTo(m);
    // Medición: un toque en el mapa añade un vértice, imantado al marcador más cercano (FR-76).
    m.on('click', (e: L.LeafletMouseEvent) => {
      const med = medicionRef.current;
      if (!med) return;
      const visibles = (grupoPuntos.current?.getLayers() ?? []) as L.Marker[];
      const enPantalla = visibles.map((mk) => {
        const ll = mk.getLatLng();
        const pt = m.latLngToContainerPoint(ll);
        return { x: pt.x, y: pt.y, lat: ll.lat, lng: ll.lng };
      });
      const iman = imantar({ x: e.containerPoint.x, y: e.containerPoint.y }, enPantalla);
      med.alTocar(iman ? { lat: iman.lat, lng: iman.lng } : { lat: e.latlng.lat, lng: e.latlng.lng });
    });
    grupoMarcas.current = L.layerGroup().addTo(m);
    mapa.current = m;

    // Pulsación larga, como en las aplicaciones de mapas de siempre: abre "¿Qué hay aquí?" (FR-72,
    // DEC-089). Sobre un marcador no: ahí manda abrir la ficha.
    const lienzo = contenedor.current;
    const sobreMarcador = (destino: EventTarget | null) =>
      destino instanceof Element && !!destino.closest('.leaflet-marker-pane');
    const avisar = (clientX: number, clientY: number, destino: EventTarget | null) => {
      if (!alPulsacionLargaRef.current || sobreMarcador(destino)) return;
      const caja = lienzo.getBoundingClientRect();
      const donde = m.containerPointToLatLng(L.point(clientX - caja.left, clientY - caja.top));
      alPulsacionLargaRef.current(donde.lat, donde.lng);
    };
    let destinoUltimo: EventTarget | null = null;
    const detector = detectorPulsacionLarga((p) => avisar(p.clientX, p.clientY, destinoUltimo));
    const bajar = (e: PointerEvent) => {
      // El ratón tiene su propio gesto: el clic derecho, que el navegador ya da hecho.
      if (e.pointerType === 'mouse') return;
      destinoUltimo = e.target;
      detector.bajar(e);
    };
    const mover = (e: PointerEvent) => detector.mover(e);
    const soltar = () => detector.soltar();
    const menu = (e: MouseEvent) => {
      // Sin menú del navegador encima del mapa: el gesto es nuestro.
      e.preventDefault();
      avisar(e.clientX, e.clientY, e.target);
    };
    lienzo.addEventListener('pointerdown', bajar);
    lienzo.addEventListener('pointermove', mover);
    lienzo.addEventListener('pointerup', soltar);
    lienzo.addEventListener('pointercancel', soltar);
    lienzo.addEventListener('contextmenu', menu);
    // Si el mapa se mueve o hace zoom, el gesto era para el mapa.
    m.on('movestart zoomstart', soltar);

    return () => {
      lienzo.removeEventListener('pointerdown', bajar);
      lienzo.removeEventListener('pointermove', mover);
      lienzo.removeEventListener('pointerup', soltar);
      lienzo.removeEventListener('pointercancel', soltar);
      lienzo.removeEventListener('contextmenu', menu);
      detector.cancelar();
      m.remove();
      mapa.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    centrar(lat, lng, zoom) {
      mapa.current?.setView([lat, lng], Math.max(zoom ?? 17, mapa.current.getZoom()));
    },
    encuadrar(recuadro, margenInferior = 0) {
      mapa.current?.fitBounds(recuadro, {
        paddingTopLeft: [56, 132],
        paddingBottomRight: [72, 48 + margenInferior],
        maxZoom: 18,
        animate: false,
      });
    },
    acercar: () => mapa.current?.zoomIn(),
    alejar: () => mapa.current?.zoomOut(),
  }));

  // Capa base, capa en línea y límite de zona: cambian con la capa elegida, el modo y la cobertura.
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const capas = capasDe(capa, modo, baseDebajo);
    capas.forEach((c) => c.addTo(m));
    return () => capas.forEach((c) => m.removeLayer(c));
  }, [capa, modo, baseDebajo]);

  // Puntos, con declutter por zoom (06 §4.4). El seleccionado se ve siempre.
  useEffect(() => {
    const m = mapa.current;
    const grupo = grupoPuntos.current;
    if (!m || !grupo) return;
    const pintar = () => {
      const z = m.getZoom();
      grupo.clearLayers();
      for (const p of puntos) {
        const sel = p.id === seleccionado;
        if (!sel && !visibleEnZoom(p.radio_px, z)) continue;
        L.marker([p.lat, p.lng], {
          icon: L.divIcon({ html: svgMarcador(p, { seleccionado: sel }), className: 'marcador', iconSize: [44, 44] }),
          title: p.codigo,
          alt: p.codigo,
          keyboard: true,
          zIndexOffset: sel ? 1000 : Math.round(p.radio_px * 10),
        })
          // Midiendo, tocar un marcador pone ahí un vértice exacto; si no, abre su ficha.
          .on('click', () =>
            medicionRef.current
              ? medicionRef.current.alTocar({ lat: p.lat, lng: p.lng })
              : alSeleccionarRef.current(p.id),
          )
          .addTo(grupo);
      }
    };
    pintar();
    m.on('zoomend', pintar);
    return () => {
      m.off('zoomend', pintar);
    };
  }, [puntos, seleccionado]);

  // Tu posición con halo de precisión (06 §4.3).
  useEffect(() => {
    const g = grupoPosicion.current;
    if (!g) return;
    g.clearLayers();
    if (!posicion) return;
    const color = '#28517F';
    L.circle([posicion.lat, posicion.lng], {
      radius: posicion.precision,
      color,
      weight: 0,
      fillColor: color,
      // Posición de hace más de un minuto o sin GPS desde entonces: halo atenuado. 06 no tiene token
      // de "atenuado"; se usa la mitad de la opacidad normal (RV-09).
      fillOpacity: esAntigua(posicion) ? 0.08 : 0.16,
      className: esAntigua(posicion) ? 'halo-antiguo' : 'halo',
      interactive: false,
    }).addTo(g);
    L.circleMarker([posicion.lat, posicion.lng], {
      radius: 4.5,
      color: 'var(--borde-marcador)',
      weight: 1.5,
      fillColor: color,
      fillOpacity: 1,
      interactive: false,
    }).addTo(g);
  }, [posicion]);

  // Marcas de trabajo (06 §4.7): el pin de "¿Qué hay aquí?". No se tocan: encima de todo y sin clic.
  useEffect(() => {
    const g = grupoMarcas.current;
    const m = mapa.current;
    if (!g || !m) return;
    g.clearLayers();
    if (!aqui) return;
    L.marker([aqui.lat, aqui.lng], {
      icon: L.divIcon({
        html: SVG_AQUI,
        className: 'marca-trabajo marca-aqui',
        iconSize: [36, 36],
        iconAnchor: [18, 34],
      }),
      interactive: false,
      keyboard: false,
      zIndexOffset: 10_000,
    }).addTo(g);
    m.panTo([aqui.lat, aqui.lng], { animate: false });
  }, [aqui]);

  // Modo incidente (FR-74, 06 §4.7): diana, líneas discontinuas a los candidatos y un encuadre que
  // deja ver el incidente y los tres primeros. Los demás marcadores siguen a la vista.
  // Con los márgenes: al abrir o cerrar la ficha se vuelve a encuadrar, para que no tape nada (RV-60).
  const claveIncidente = incidente
    ? [incidente.origen, ...incidente.candidatos]
        .map((l) => `${l.lat.toFixed(6)},${l.lng.toFixed(6)}`)
        .concat(String(incidente.margenInferior ?? 0), String(incidente.margenDerecho ?? 0))
        .join(';')
    : '';
  useEffect(() => {
    const g = grupoIncidente.current;
    const m = mapa.current;
    if (!g || !m) return;
    g.clearLayers();
    if (!incidente) return;
    const { origen, candidatos } = incidente;
    for (const c of candidatos) {
      L.polyline(
        [
          [origen.lat, origen.lng],
          [c.lat, c.lng],
        ],
        { weight: 2, dashArray: '6 6', className: 'linea-incidente', interactive: false },
      ).addTo(g);
    }
    L.marker([origen.lat, origen.lng], {
      icon: L.divIcon({ html: SVG_DIANA, className: 'marca-trabajo marca-incidente', iconSize: [32, 32] }),
      interactive: false,
      keyboard: false,
      zIndexOffset: 10_000,
      alt: T.incidente.diana,
    }).addTo(g);
    const encuadre = L.latLngBounds([origen, ...candidatos.slice(0, 3)].map((l) => [l.lat, l.lng] as [number, number]));
    // En el móvil la hoja tapa la mitad de abajo: el encuadre la descuenta.
    m.fitBounds(encuadre, {
      // Arriba, la búsqueda y la columna de herramientas: los candidatos no quedan debajo.
      paddingTopLeft: [56, 132],
      paddingBottomRight: [72 + (incidente.margenDerecho ?? 0), 48 + (incidente.margenInferior ?? 0)],
      maxZoom: 18,
      animate: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la clave resume origen y candidatos
  }, [claveIncidente]);

  // Calle resaltada (06 §4.7): línea de 4 px, debajo de los marcadores para no tapar ninguno.
  useEffect(() => {
    const g = grupoCalle.current;
    if (!g) return;
    g.clearLayers();
    if (!calle?.length) return;
    L.polyline(
      calle.map((linea) => linea.map(([lng, lat]) => [lat, lng] as [number, number])),
      { weight: 4, className: 'linea-calle', interactive: false },
    ).addTo(g);
  }, [calle]);

  // Medición (06 §4.7): línea de 3 px, vértices de 10 px y la distancia de cada tramo de más de 30 m.
  const claveMedicion = medicion ? medicion.vertices.map((l) => `${l.lat},${l.lng}`).join(';') : '';
  useEffect(() => {
    const g = grupoMedicion.current;
    if (!g) return;
    g.clearLayers();
    if (!medicion) return;
    const lista = medicion.vertices.map((l) => [l.lat, l.lng] as [number, number]);
    if (lista.length > 1) L.polyline(lista, { weight: 3, className: 'linea-medicion', interactive: false }).addTo(g);
    for (const v of lista) {
      L.circleMarker(v, { radius: 5, weight: 2, className: 'vertice-medicion', interactive: false }).addTo(g);
    }
    const m = mapa.current;
    for (const e of medicion.etiquetas) {
      // A 14 px de la línea, en perpendicular al tramo: sobre ella, la línea la tachaba (RV-67).
      const d = m
        ? desplazamientoEtiqueta(
            m.latLngToLayerPoint([e.desde.lat, e.desde.lng]),
            m.latLngToLayerPoint([e.hasta.lat, e.hasta.lng]),
          )
        : { x: 0, y: 0 };
      L.marker([e.en.lat, e.en.lng], {
        icon: L.divIcon({
          html: distancia(e.metros),
          className: 'etiqueta-medicion',
          iconSize: [56, 20],
          iconAnchor: [28 - d.x, 10 - d.y],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(g);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la clave resume los vértices
  }, [claveMedicion, !!medicion]);

  return (
    <div className="absolute inset-0">
      <div ref={contenedor} className="bg-fondo h-full w-full" data-testid="mapa" />
    </div>
  );
});
