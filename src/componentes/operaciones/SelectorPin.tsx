import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { LocateFixed } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { capasDe } from '../mapa/capas-leaflet';
import { ICONO_PIN } from '../mapa/iconos-leaflet';
import { useModo, usePosicion } from '@/hooks/estado';
import { ZOOM_MAX, capaGuardada } from '@/lib/capas';
import type { Coordenadas } from '@/lib/propuestas';
import { type Posicion, activarPosicion } from '@/lib/posicion';
import { T } from '@/lib/textos';

/**
 * Mapa pequeño para colocar el punto (FR-50, FL-03, FL-07): se arrastra el pin o se toca el mapa.
 * Enseña el GPS con su halo y, al corregir una ubicación, la posición anterior en gris con la línea
 * del desplazamiento. El botón de posición centra el mapa en el GPS, como en cualquier app de mapas;
 * en un alta, además, devuelve el pin a la posición GPS.
 */
export function SelectorPin({
  pin,
  gps,
  original,
  alMover,
  alUsarMiPosicion,
  etiqueta,
}: {
  pin: Coordenadas | undefined;
  gps: Posicion | null;
  original?: Coordenadas;
  alMover: (c: Coordenadas) => void;
  /** Se llama al pulsar "Mi posición" con GPS disponible. */
  alUsarMiPosicion?: () => void;
  etiqueta: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const marcador = useRef<L.Marker | null>(null);
  const extras = useRef<L.LayerGroup | null>(null);
  const alMoverRef = useRef(alMover);
  const modo = useModo();
  const estadoPos = usePosicion();
  const pendiente = useRef(false);
  const alUsarRef = useRef(alUsarMiPosicion);

  useEffect(() => {
    alUsarRef.current = alUsarMiPosicion;
  }, [alUsarMiPosicion]);

  useEffect(() => {
    alMoverRef.current = alMover;
  }, [alMover]);

  useEffect(() => {
    if (!contenedor.current) return;
    const inicio = pin ?? original ?? (gps ? { lat: gps.lat, lng: gps.lng } : { lat: 37.2308, lng: -3.6569 });
    const m = L.map(contenedor.current, {
      zoomControl: false,
      attributionControl: false,
      minZoom: 12,
      maxZoom: ZOOM_MAX,
    });
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

  // El pin se mueve (GPS que llega, botón de posición…): solo se mueve el pin. El mapa no se
  // recentra solo, que descoloca mientras se ajusta a mano; para eso está "Mi posición" (DEC-066).
  useEffect(() => {
    if (!pin) return;
    marcador.current?.setLatLng([pin.lat, pin.lng]);
  }, [pin]);

  function irAMiPosicion(p: Posicion) {
    mapa.current?.setView([p.lat, p.lng], Math.max(18, mapa.current.getZoom()));
    alUsarRef.current?.();
  }

  // Si se pulsó el botón antes de tener GPS, se centra en cuanto llega la primera lectura.
  useEffect(() => {
    if (pendiente.current && gps) {
      pendiente.current = false;
      irAMiPosicion(gps);
    }
  }, [gps]);

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

  const aviso =
    estadoPos.tipo === 'denegada'
      ? T.mapa.posicionDenegada
      : estadoPos.tipo === 'no_disponible'
        ? T.mapa.posicionNoDisponible
        : null;

  return (
    <div className="relative isolate">
      <div
        ref={contenedor}
        className="rounded-tarjeta border-linea h-84 overflow-hidden border"
        data-testid="selector-pin"
      />
      <button
        type="button"
        aria-label={T.mapa.miPosicion}
        title={T.mapa.miPosicion}
        onClick={() => {
          activarPosicion();
          if (gps) irAMiPosicion(gps);
          else pendiente.current = true;
        }}
        className="text-texto rounded-tarjeta absolute top-2 right-2 z-[500] flex size-11 items-center justify-center bg-[var(--control-mapa)] shadow-[0_1px_5px_rgba(0,0,0,.18)]"
      >
        <LocateFixed size={20} aria-hidden />
      </button>
      {aviso && (
        <p className="bg-oro-100 border-oro-600 text-ambar-700 rounded-tarjeta absolute inset-x-2 bottom-2 z-[500] border px-2 py-1 text-[13px]">
          {aviso}
        </p>
      )}
    </div>
  );
}
