import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { capasDe } from '../mapa/capas-leaflet';
import { ICONO_PIN, iconoPunto } from '../mapa/iconos-leaflet';
import { useModo, usePuntos } from '@/hooks/estado';
import { type Punto, metros } from '@/lib/puntos';
import { T } from '@/lib/textos';

/** Radio alrededor del pin en el que se dibujan los puntos aprobados (m). */
const ALREDEDOR_M = 250;

/**
 * Minimapa de una propuesta (FR-103): el pin propuesto, los puntos aprobados alrededor y, según el
 * caso, la posición anterior (corregir ubicación) o el posible duplicado, unidos al pin por una línea.
 */
export function MinimapaPropuesta({
  lat,
  lng,
  original,
  duplicado,
}: {
  lat: number;
  lng: number;
  original?: Punto;
  duplicado?: Punto;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const grupo = useRef<L.LayerGroup | null>(null);
  const modo = useModo();
  const { puntos } = usePuntos();

  useEffect(() => {
    if (!contenedor.current) return;
    const m = L.map(contenedor.current, { zoomControl: true, attributionControl: false, minZoom: 12, maxZoom: 20 });
    grupo.current = L.layerGroup().addTo(m);
    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
    };
  }, []);

  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const capas = capasDe('base', modo);
    capas.forEach((c) => c.addTo(m));
    return () => capas.forEach((c) => m.removeLayer(c));
  }, [modo]);

  useEffect(() => {
    const m = mapa.current;
    const g = grupo.current;
    if (!m || !g) return;
    g.clearLayers();
    const aqui = { lat, lng };
    for (const p of puntos) {
      if (p.id === original?.id || metros(p, aqui) > ALREDEDOR_M) continue;
      L.marker([p.lat, p.lng], {
        icon: iconoPunto(p, p.id === duplicado?.id ? 1 : 0.8),
        title: p.codigo,
        keyboard: false,
      }).addTo(g);
    }
    const encuadre = L.latLngBounds([aqui, aqui]);
    for (const otro of [original, duplicado]) {
      if (!otro) continue;
      encuadre.extend([otro.lat, otro.lng]);
      L.polyline(
        [
          [otro.lat, otro.lng],
          [lat, lng],
        ],
        { color: otro === original ? '#9C2B1E' : '#7F5C07', weight: 1.5, dashArray: '3 3', interactive: false },
      ).addTo(g);
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
    }
    L.marker([lat, lng], { icon: ICONO_PIN, keyboard: false, interactive: false }).addTo(g);
    m.fitBounds(encuadre.pad(0.6), { maxZoom: 18 });
  }, [lat, lng, original, duplicado, puntos]);

  return (
    <div
      ref={contenedor}
      role="img"
      aria-label={T.panelCola.minimapa}
      className="rounded-tarjeta border-linea isolate mb-2 h-44 overflow-hidden border"
      data-testid="minimapa-propuesta"
    />
  );
}
