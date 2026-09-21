import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { LIMITES, capasDe } from './capas-leaflet';
import { type Capa, ZOOM_MAX } from '@/lib/capas';
import type { Posicion } from '@/lib/posicion';
import type { Punto } from '@/lib/puntos';
import { detectorPulsacionLarga } from '@/lib/pulsacion-larga';
import { svgMarcador, visibleEnZoom } from '@/lib/simbologia';

const VISTA = 'hidrantes.vista';

export interface ControlMapa {
  centrar(lat: number, lng: number, zoom?: number): void;
  acercar(): void;
  alejar(): void;
}

interface Props {
  puntos: Punto[];
  seleccionado: string | null;
  capa: Capa;
  modo: 'claro' | 'oscuro';
  posicion: Posicion | null;
  alSeleccionar: (id: string) => void;
  /** Pulsación larga (o clic derecho) sobre el mapa, para dar de alta ahí mismo (DEC-077). */
  alPulsacionLarga?: (lat: number, lng: number) => void;
}

function vistaGuardada(): { centro: [number, number]; zoom: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(VISTA) ?? 'null');
    return v && Array.isArray(v.centro) ? v : null;
  } catch {
    return null;
  }
}

/** Mapa de Leaflet con el mapa base propio, las capas en línea, el límite, los puntos y tu posición. */
export const MapaLeaflet = forwardRef<ControlMapa, Props>(function MapaLeaflet(
  { puntos, seleccionado, capa, modo, posicion, alSeleccionar, alPulsacionLarga },
  ref,
) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const grupoPuntos = useRef<L.LayerGroup | null>(null);
  const grupoPosicion = useRef<L.LayerGroup | null>(null);
  const alSeleccionarRef = useRef(alSeleccionar);
  useEffect(() => {
    alSeleccionarRef.current = alSeleccionar;
  }, [alSeleccionar]);
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
    m.on('moveend', () => {
      const c = m.getCenter();
      try {
        localStorage.setItem(VISTA, JSON.stringify({ centro: [c.lat, c.lng], zoom: m.getZoom() }));
      } catch {
        // sin almacenamiento: la próxima vez se encuadra la zona
      }
    });
    grupoPuntos.current = L.layerGroup().addTo(m);
    grupoPosicion.current = L.layerGroup().addTo(m);
    mapa.current = m;

    // Alta con pulsación larga, como en las aplicaciones de mapas de siempre (DEC-077). Sobre un
    // marcador no: ahí manda abrir la ficha.
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
    acercar: () => mapa.current?.zoomIn(),
    alejar: () => mapa.current?.zoomOut(),
  }));

  // Capa base, capa en línea y límite de zona: cambian con la capa elegida y con el modo.
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const capas = capasDe(capa, modo);
    capas.forEach((c) => c.addTo(m));
    return () => capas.forEach((c) => m.removeLayer(c));
  }, [capa, modo]);

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
          .on('click', () => alSeleccionarRef.current(p.id))
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
      fillOpacity: 0.16,
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

  return (
    <div className="absolute inset-0">
      <div ref={contenedor} className="bg-fondo h-full w-full" data-testid="mapa" />
    </div>
  );
});
