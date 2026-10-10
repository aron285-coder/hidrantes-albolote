import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { LocateFixed } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { capasDe } from '../mapa/capas-leaflet';
import { ICONO_PIN, ICONO_PIN_SIN_COLOCAR } from '../mapa/iconos-leaflet';
import { useConexion, useMapabase, useModo, usePosicion } from '@/hooks/estado';
import { ZOOM_MAX, atribucion, baseDebajo, capaGuardada } from '@/lib/capas';
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
  alto = 'h-84',
  rotuloOriginal,
}: {
  pin: Coordenadas | undefined;
  gps: Posicion | null;
  original?: Coordenadas;
  alMover: (c: Coordenadas) => void;
  /** Se llama al pulsar "Mi posición" con GPS disponible. */
  alUsarMiPosicion?: () => void;
  etiqueta: string;
  /** Alto del mapa (clase de Tailwind). En Editar del panel, 230 px y 200 px en el móvil (docs/29 RV-124). */
  alto?: string;
  /** Rótulo fijo junto a la posición de antes, p. ej. "antes · 6 m" (docs/29 RV-124). Sin él, solo el círculo. */
  rotuloOriginal?: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const marcador = useRef<L.Marker | null>(null);
  const extras = useRef<L.LayerGroup | null>(null);
  const alMoverRef = useRef(alMover);
  const modo = useModo();
  const conexion = useConexion();
  const mapabase = useMapabase();
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

  // Las mismas capas que el mapa principal (FR-63): la elegida y, sin cobertura y con el mapa base en
  // el móvil, el mapa base debajo. Al cambiar la conexión se vuelven a pintar: con Satélite elegido y
  // sin señal, el pin ya no se pone sobre un mapa gris (docs/31 RV-150).
  const debajo = baseDebajo(conexion, mapabase.descargado !== null);
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const capas = capasDe(capaGuardada(), modo, debajo);
    capas.forEach((c) => c.addTo(m));
    return () => capas.forEach((c) => m.removeLayer(c));
  }, [modo, debajo]);

  // El pin se mueve (GPS que llega, botón de posición…): solo se mueve el pin. El mapa no se
  // recentra solo, que descoloca mientras se ajusta a mano; para eso está "Mi posición" (DEC-066).
  // Sin pin (un alta sin GPS, o con la posición `antigua`), el marcador está pero no colocado: gris y
  // discontinuo, como dice «Mueve el pin al sitio correcto» (docs/31 RV-157, punto 6). Al tocar el
  // mapa o arrastrarlo, el formulario recibe el pin y vuelve el naranja.
  // Solo cuando cambia de colocado a sin colocar: setIcon rehace el elemento del marcador, y hacerlo
  // con cada lectura del GPS cortaría un arrastre a medias.
  const colocado = !!pin;
  useEffect(() => {
    marcador.current?.setIcon(colocado ? ICONO_PIN : ICONO_PIN_SIN_COLOCAR);
  }, [colocado]);

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
      const antes = L.circleMarker([original.lat, original.lng], {
        radius: 7,
        color: '#7A8582',
        weight: 1.5,
        dashArray: '2 2',
        fill: false,
        interactive: false,
      }).addTo(g);
      if (rotuloOriginal) {
        antes.bindTooltip(rotuloOriginal, {
          permanent: true,
          direction: 'bottom',
          offset: [0, 6],
          className: 'rotulo-antes',
        });
      }
      if (pin) {
        L.polyline(
          [
            [original.lat, original.lng],
            [pin.lat, pin.lng],
          ],
          { color: 'var(--rojo-700)', weight: 1.5, dashArray: '3 3', interactive: false },
        ).addTo(g);
      }
    }
  }, [gps, original, pin, rotuloOriginal]);

  // El primer arreglo del GPS puede tardar medio minuto en la calle: sin este "buscando", el botón
  // de posición parece roto y se pulsa tres veces (UI-01, UI-05). Es el mismo aviso que el mapa.
  const aviso =
    estadoPos.tipo === 'denegada'
      ? T.mapa.posicionDenegada
      : estadoPos.tipo === 'no_disponible'
        ? T.mapa.posicionNoDisponible
        : estadoPos.tipo === 'buscando'
          ? T.mapa.buscandoPosicion
          : null;

  // Sin cobertura y sin el mapa base en el móvil, el fondo queda vacío: se dice encima del mapa del
  // pin, y dónde descargarlo (docs/32 RV-243).
  const sinFondo = conexion === 'sin_cobertura' && !mapabase.descargado;

  return (
    <div className="relative isolate">
      <div
        ref={contenedor}
        className={`rounded-tarjeta border-linea overflow-hidden border ${alto}`}
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
      {sinFondo && (
        <p
          role="status"
          data-testid="aviso-pin-sin-mapa"
          className="bg-tinte-oro border-oro-600 text-tinte-oro-texto rounded-tarjeta absolute top-2 right-15 left-2 z-[500] border px-2 py-1 text-[13px]"
        >
          {T.operaciones.pinSinMapa}
        </p>
      )}
      {/* Licencias de lo que se ve, compacta como en el mapa principal (OSM, PNOA; docs/32 RV-243). */}
      <p
        data-testid="atribucion-pin"
        className="text-texto-suave absolute right-1 bottom-0.5 z-[400] rounded bg-[var(--control-mapa)] px-1 text-[10px]"
      >
        {atribucion(capaGuardada())}
      </p>
      {aviso && (
        <p
          role="status"
          className="bg-tinte-oro border-oro-600 text-tinte-oro-texto rounded-tarjeta absolute inset-x-2 bottom-5 z-[500] border px-2 py-1 text-[13px]"
        >
          {aviso}
        </p>
      )}
    </div>
  );
}
