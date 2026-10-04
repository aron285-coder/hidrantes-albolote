import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { capasDe } from '../mapa/capas-leaflet';
import { ICONO_PIN, iconoPunto } from '../mapa/iconos-leaflet';
import { useModo, usePuntos } from '@/hooks/estado';
import { distancia } from '@/lib/formato';
import type { PlanMapa } from '@/lib/panel/cola';
import { metros } from '@/lib/puntos';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

/** Radio alrededor del centro en el que se dibujan los puntos aprobados (m). */
const ALREDEDOR_M = 250;
/** Los puntos de alrededor, atenuados: el que importa es el de la propuesta (RV-110). */
const OPACIDAD_ALREDEDOR = 0.55;
const GRIS_AHORA = '#7A8582';

type Capa = PlanMapa['capa'];

/**
 * El mapa del detalle de la cola (FR-103, docs/25 RV-110): en las seis operaciones, a todo el ancho.
 * El punto con un anillo; en un alta, el pin propuesto y el círculo de duplicado; en una ubicación,
 * la posición de ahora en gris y la propuesta, unidas por una flecha con los metros. Conmutador
 * Mapa / Satélite, zoom y "Abrir en grande". Debajo, una leyenda de una línea.
 */
export function MinimapaPropuesta({
  plan,
  radioDuplicado,
  className,
}: {
  plan: PlanMapa;
  radioDuplicado: number;
  className?: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const grupo = useRef<L.LayerGroup | null>(null);
  const modo = useModo();
  const { puntos } = usePuntos();
  const [capa, setCapa] = useState<Capa>(plan.capa);
  const [grande, setGrande] = useState(false);
  const { centro } = plan;

  useEffect(() => {
    if (!contenedor.current || !centro) return;
    const m = L.map(contenedor.current, { zoomControl: false, attributionControl: false, minZoom: 12, maxZoom: 20 });
    L.control.zoom({ position: 'bottomright', zoomInTitle: '+', zoomOutTitle: '−' }).addTo(m);
    grupo.current = L.layerGroup().addTo(m);
    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
    };
    // El mapa se crea una vez: el detalle se monta con key = id de la propuesta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!centro]);

  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const capas = capasDe(capa, modo);
    capas.forEach((c) => c.addTo(m));
    return () => capas.forEach((c) => m.removeLayer(c));
  }, [capa, modo, centro]);

  useEffect(() => {
    const m = mapa.current;
    const g = grupo.current;
    if (!m || !g || !centro) return;
    g.clearLayers();
    const encuadre = L.latLngBounds([centro, centro]);
    for (const p of puntos) {
      if (p.id === plan.puntoId || metros(p, centro) > ALREDEDOR_M) continue;
      const duplicado = p.id === plan.duplicadoId;
      const marca = L.marker([p.lat, p.lng], {
        icon: iconoPunto(p, duplicado ? 1 : OPACIDAD_ALREDEDOR),
        title: p.codigo,
        keyboard: false,
        interactive: false,
      }).addTo(g);
      // El código del punto que choca con el alta, siempre a la vista.
      if (duplicado) {
        marca.bindTooltip(p.codigo, { permanent: true, direction: 'right', className: 'font-datos' });
        encuadre.extend([p.lat, p.lng]);
      }
    }
    const { actual, propuesta, flecha } = plan;
    if (actual && propuesta) {
      // Corregir ubicación: la de ahora en gris, la flecha hasta la propuesta y los metros.
      L.circleMarker(actual, {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: GRIS_AHORA,
        fillOpacity: 1,
        interactive: false,
      }).addTo(g);
      L.polyline([actual, propuesta], {
        weight: 2.5,
        dashArray: '6 5',
        className: '[stroke:var(--anillo-seleccion)]',
        interactive: false,
      }).addTo(g);
      L.marker(puntaDeFlecha(actual, propuesta), {
        icon: iconoFlecha(rumbo(actual, propuesta)),
        keyboard: false,
        interactive: false,
      }).addTo(g);
      if (flecha) {
        L.tooltip({ permanent: true, direction: 'center', className: 'font-datos font-semibold' })
          .setLatLng([(actual.lat + propuesta.lat) / 2, (actual.lng + propuesta.lng) / 2])
          .setContent(distancia(flecha.metros))
          .addTo(g);
      }
      encuadre.extend(actual);
    } else if (actual) {
      // El punto de la propuesta, con su marcador y un anillo que lo destaca.
      const propio = puntos.find((p) => p.id === plan.puntoId);
      if (propio) L.marker(actual, { icon: iconoPunto(propio), keyboard: false, interactive: false }).addTo(g);
      L.circleMarker(actual, {
        radius: 17,
        weight: 3,
        fill: false,
        className: '[stroke:var(--anillo-seleccion)]',
        interactive: false,
      }).addTo(g);
    }
    if (propuesta) {
      if (plan.circulo) {
        L.circle(propuesta, {
          radius: radioDuplicado,
          weight: 1.5,
          dashArray: '4 4',
          fill: false,
          className: '[stroke:var(--oro-600)]',
          interactive: false,
        }).addTo(g);
        // Sin circle.getBounds(): pide la vista del mapa, que la primera vez aún no existe.
        encuadre.extend(L.latLng(propuesta).toBounds(radioDuplicado * 2));
      }
      L.marker(propuesta, { icon: ICONO_PIN, keyboard: false, interactive: false }).addTo(g);
      encuadre.extend(propuesta);
    }
    m.fitBounds(encuadre.pad(0.6), { maxZoom: 18 });
  }, [plan, centro, puntos, radioDuplicado]);

  // A pantalla completa y de vuelta: Leaflet tiene que volver a medir su caja. Escape cierra.
  useEffect(() => {
    mapa.current?.invalidateSize();
    if (!grande) return;
    const cerrar = (e: KeyboardEvent) => e.key === 'Escape' && setGrande(false);
    window.addEventListener('keydown', cerrar);
    return () => window.removeEventListener('keydown', cerrar);
  }, [grande]);

  if (!centro) {
    return (
      <p
        data-testid="minimapa-propuesta"
        className={cn('border-linea bg-papel rounded-tarjeta text-texto-suave border px-3 py-6 text-center', className)}
      >
        {T.panelCola.sinPosicion}
      </p>
    );
  }

  return (
    <div className={className}>
      <div
        data-testid="minimapa-propuesta"
        data-capa={capa}
        className={cn(
          'isolate overflow-hidden bg-[#ECEAE1]',
          grande
            ? 'fixed inset-0 z-50'
            : 'border-linea rounded-tarjeta relative h-[200px] border max-md:rounded-none max-md:border-x-0 md:max-[1099px]:h-[280px] min-[1100px]:h-[300px]',
        )}
      >
        <div ref={contenedor} role="img" aria-label={T.panelCola.minimapa} className="absolute inset-0" />
        <div
          role="radiogroup"
          aria-label={T.panelCola.capaDelMapa}
          className="absolute top-2 right-2 z-[1000] flex gap-1 text-[12px]"
        >
          {(['base', 'satelite'] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={capa === c}
              onClick={() => setCapa(c)}
              className={cn(
                'border-linea min-h-9 rounded-md border px-2.5 shadow-sm',
                capa === c ? 'bg-barra border-barra text-white' : 'bg-papel text-texto-suave',
              )}
            >
              {c === 'base' ? T.panelCola.capaMapa : T.panelCola.capaSatelite}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setGrande((g) => !g)}
          aria-pressed={grande}
          className="border-linea bg-papel text-texto absolute bottom-2 left-2 z-[1000] min-h-9 rounded-md border px-2.5 text-[12px] font-bold shadow-sm"
        >
          {grande ? T.panelCola.cerrarGrande : T.panelCola.abrirEnGrande}
        </button>
      </div>
      <Leyenda plan={plan} radioDuplicado={radioDuplicado} />
    </div>
  );
}

/** Una línea con lo que se ve en el mapa (RV-110). */
function Leyenda({ plan, radioDuplicado }: { plan: PlanMapa; radioDuplicado: number }) {
  const punto = (color: string) => (
    <span aria-hidden className="mr-1 inline-block size-2.5 rounded-full align-[-1px]" style={{ background: color }} />
  );
  const elementos: [React.ReactNode, string][] = [];
  if (plan.actual && plan.propuesta) elementos.push([punto(GRIS_AHORA), T.panelCola.leyendaAhora]);
  else if (plan.actual)
    elementos.push([
      <span
        key="anillo"
        aria-hidden
        className="mr-1 inline-block size-2.5 rounded-full border-2 border-[var(--anillo-seleccion)] align-[-1px]"
      />,
      T.panelCola.leyendaPunto,
    ]);
  if (plan.propuesta) elementos.push([punto('var(--naranja-600)'), T.panelCola.leyendaPropuesta]);
  if (plan.circulo)
    elementos.push([
      <span
        key="radio"
        aria-hidden
        className="border-oro-600 mr-1 inline-block size-2.5 rounded-full border border-dashed align-[-1px]"
      />,
      T.panelCola.leyendaRadio(radioDuplicado),
    ]);
  elementos.push([
    <span
      key="alrededor"
      aria-hidden
      className="mr-1 inline-block size-2.5 rounded-full bg-verde-600 align-[-1px] opacity-55"
    />,
    T.panelCola.leyendaAlrededor,
  ]);
  return (
    <p className="text-texto-suave mt-1.5 flex flex-wrap gap-x-4 gap-y-1 px-0.5 text-[12.5px] max-md:px-4">
      {elementos.map(([icono, texto]) => (
        <span key={texto}>
          {icono}
          {texto}
        </span>
      ))}
    </p>
  );
}

type Pos = { lat: number; lng: number };

/** Rumbo en pantalla (grados, 0 = este, horario) de a hacia b. */
function rumbo(a: Pos, b: Pos): number {
  const dx = (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180);
  const dy = b.lat - a.lat;
  return (Math.atan2(-dy, dx) * 180) / Math.PI;
}

/** La punta, un poco antes del pin propuesto, para que no quede debajo. */
const puntaDeFlecha = (a: Pos, b: Pos): [number, number] => [
  a.lat + (b.lat - a.lat) * 0.8,
  a.lng + (b.lng - a.lng) * 0.8,
];

const iconoFlecha = (grados: number) =>
  L.divIcon({
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    html: `<svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true" style="transform:rotate(${grados}deg)"><path d="M7 0 L-6 -6 L-3 0 L-6 6 Z" style="fill:var(--anillo-seleccion)"/></svg>`,
  });
