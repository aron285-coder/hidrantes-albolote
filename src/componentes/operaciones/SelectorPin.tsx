import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { capasDe } from '../mapa/capas-leaflet';
import { useModo } from '@/hooks/estado';
import { capaGuardada } from '@/lib/capas';
import type { Coordenadas } from '@/lib/propuestas';
import type { Posicion } from '@/lib/posicion';

/** Pin naranja arrastrable con punto blanco (06 §4.3, "propuesto"). */
const ICONO_PIN = L.divIcon({
  className: 'marcador',
  iconSize: [44, 44],
  iconAnchor: [22, 38],
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="-22 -38 44 44" aria-hidden="true" style="filter:drop-shadow(0 2px 2px rgba(0,0,0,.3))"><path d="M0 -32 C8 -32 13 -26 13 -18 C13 -9 0 4 0 4 C0 4 -13 -9 -13 -18 C-13 -26 -8 -32 0 -32 Z" fill="var(--naranja-600)" stroke="#fff" stroke-width="2"/><circle cx="0" cy="-18" r="4.5" fill="#fff"/></svg>`,
});

/**
 * Mapa pequeño para colocar el punto (FR-50, FL-03, FL-07): se arrastra el pin o se toca el mapa.
 * Enseña el GPS con su halo y, al corregir una ubicación, la posición anterior en gris con la línea
 * del desplazamiento.
 */
export function SelectorPin({
  pin,
  gps,
  original,
  alMover,
  etiqueta,
}: {
  pin: Coordenadas | undefined;
  gps: Posicion | null;
  original?: Coordenadas;
  alMover: (c: Coordenadas) => void;
  etiqueta: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const marcador = useRef<L.Marker | null>(null);
  const extras = useRef<L.LayerGroup | null>(null);
  const alMoverRef = useRef(alMover);
  const modo = useModo();

  useEffect(() => {
    alMoverRef.current = alMover;
  }, [alMover]);

  useEffect(() => {
    if (!contenedor.current) return;
    const inicio = pin ?? original ?? (gps ? { lat: gps.lat, lng: gps.lng } : { lat: 37.2308, lng: -3.6569 });
    const m = L.map(contenedor.current, { zoomControl: false, attributionControl: false, minZoom: 12, maxZoom: 20 });
    m.setView([inicio.lat, inicio.lng], 18);
    extras.current = L.layerGroup().addTo(m);
    const mk = L.marker([inicio.lat, inicio.lng], {
      icon: ICONO_PIN,
      draggable: true,
      keyboard: true,
      title: etiqueta,
      alt: etiqueta,
    });
    mk.on('dragend', () => {
      const c = mk.getLatLng();
      alMoverRef.current({ lat: c.lat, lng: c.lng });
    });
    mk.addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      mk.setLatLng(e.latlng);
      alMoverRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    marcador.current = mk;
    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
    };
    // El mapa se crea una vez; el pin se mueve después con setLatLng.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const capas = capasDe(capaGuardada() === 'satelite' ? 'satelite' : 'base', modo);
    capas.forEach((c) => c.addTo(m));
    return () => capas.forEach((c) => m.removeLayer(c));
  }, [modo]);

  useEffect(() => {
    if (pin) marcador.current?.setLatLng([pin.lat, pin.lng]);
  }, [pin]);

  useEffect(() => {
    const g = extras.current;
    if (!g) return;
    g.clearLayers();
    if (gps) {
      L.circle([gps.lat, gps.lng], {
        radius: gps.precision,
        weight: 0,
        fillColor: '#28517F',
        fillOpacity: 0.16,
        interactive: false,
      }).addTo(g);
      L.circleMarker([gps.lat, gps.lng], {
        radius: 4.5,
        color: '#fff',
        weight: 1.5,
        fillColor: '#28517F',
        fillOpacity: 1,
        interactive: false,
      }).addTo(g);
    }
    if (original) {
      L.circleMarker([original.lat, original.lng], {
        radius: 7,
        color: '#7A8582',
        weight: 1.5,
        dashArray: '2 2',
        fill: false,
        interactive: false,
      }).addTo(g);
      if (pin) {
        L.polyline(
          [
            [original.lat, original.lng],
            [pin.lat, pin.lng],
          ],
          { color: '#9C2B1E', weight: 1.5, dashArray: '3 3', interactive: false },
        ).addTo(g);
      }
    }
  }, [gps, original, pin]);

  return (
    <div
      ref={contenedor}
      className="rounded-tarjeta border-linea isolate h-56 overflow-hidden border"
      data-testid="selector-pin"
    />
  );
}
