import { ChevronDown, ChevronUp, List, Navigation, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { MarcadorSvg } from './MarcadorSvg';
import type { LatLng } from '@/lib/coordenadas';
import { enlaceComoLlegar, nombreCaudal } from '@/lib/ficha';
import { distancia, hace } from '@/lib/formato';
import { rumboCorto } from '@/lib/geometria';
import { type AlturaHoja, alturaHoja, alturaTrasArrastrar, guardarAlturaHoja } from '@/lib/hoja-cercanos';
import { type Candidato, PRECISION_POCA_M } from '@/lib/incidente';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

export interface EstadoCercanos {
  /** Sin origen: se pidió "Cercanos" sin posición (FR-74). */
  origen: LatLng | null;
  desdeGps: boolean;
  /** Sin origen todavía: el GPS está buscando el primer fix (RV-59). */
  buscando: boolean;
  /** Precisión (m) de la posición de origen, de la URL (RV-59). */
  precision: number | null;
  /** Momento de la posición si ya no está al día (RV-40). */
  posicionVieja: number | null;
  candidatos: Candidato[];
  soloHidrantes: boolean;
}

/** «·» y un espacio duro (U+00A0): el separador va pegado a lo que sigue (docs/33 RV-316, D8). */
const SEP = `·${String.fromCharCode(0xa0)}`;

const boton =
  'bg-papel border-texto text-texto rounded-boton flex min-h-11 items-center justify-center gap-2 border-[1.5px] px-3 text-[14px] font-semibold';

/**
 * Hoja "Cercanos" del modo incidente (FR-74, docs/18 GM-03): como mucho cinco puntos que funcionan,
 * en orden de distancia en línea recta. Cada fila da lo justo para un servicio (docs/27 RV-114,
 * DEC-165): el código, "diámetro · estado", la distancia y el rumbo, y un solo botón, Cómo llegar.
 * En el móvil y la tableta va abajo, en una hoja; en ordenador ocupa la columna de la lista, y nunca
 * flota sobre el plano ni tapa la ficha (docs/19 RV-60).
 */
export function PanelCercanos({
  estado,
  variante,
  dejarSitioFicha = false,
  alVolverALista,
  alCerrar,
  alMarcarEnMapa,
  alCambiarSoloHidrantes,
  alElegir,
  alVerLista,
}: {
  estado: EstadoCercanos;
  /** `hoja`: abajo, en el móvil y la tableta; `columna`: en la columna de la lista, en ordenador. */
  variante: 'hoja' | 'columna';
  /** Tableta con la ficha abierta a la derecha: la hoja se queda a su izquierda (RV-60). */
  dejarSitioFicha?: boolean;
  /** En la columna: vuelve a enseñar la lista, con el incidente abierto (RV-60). */
  alVolverALista?: () => void;
  alCerrar: () => void;
  /** "Marcar en el mapa" con una posición poco precisa (RV-59). */
  alMarcarEnMapa: () => void;
  alCambiarSoloHidrantes: (si: boolean) => void;
  alElegir: (id: string) => void;
  alVerLista: () => void;
}) {
  const { origen, desdeGps, buscando, precision, posicionVieja, candidatos, soloHidrantes } = estado;
  // Un solo aviso a la vez, y solo cuando importa (DEC-165): una posición poco precisa o vieja hace
  // que las distancias estén mal. Gana el de poco precisa, que lleva acción.
  const pocoPrecisa = desdeGps && precision !== null && precision > PRECISION_POCA_M;
  const aviso = pocoPrecisa
    ? T.incidente.pocoPrecisa(precision)
    : posicionVieja !== null
      ? T.incidente.posicionDe(hace(posicionVieja))
      : null;
  // En el móvil, dos alturas: 55 % por defecto y 90 % arrastrando el asa o con su botón (RV-61).
  const [altura, setAltura] = useState<AlturaHoja>(alturaHoja);
  const cambiarAltura = (a: AlturaHoja) => {
    setAltura(a);
    guardarAlturaHoja(a);
  };
  const arrastre = useRef<number | null>(null);
  const enHoja = variante === 'hoja';
  return (
    <section
      aria-label={T.incidente.titulo}
      className={cn(
        'bg-fondo flex flex-col gap-2 overflow-y-auto p-3',
        enHoja
          ? cn(
              'rounded-t-hoja absolute bottom-0 left-0 z-[600] pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom),var(--aviso-abajo,0px))] shadow-xl',
              // La ficha flotante mide 360 px y está a 64 px del borde: 432 px libres a la derecha.
              dejarSitioFicha ? 'right-[27rem]' : 'right-0',
              altura === 'alta' ? 'max-h-[90%]' : 'max-h-[55%]',
            )
          : // En la columna: sin origen (sin posición o buscando) es un aviso sobre la lista.
            origen
            ? 'min-h-0 flex-1'
            : 'border-linea shrink-0 border-b',
      )}
    >
      {enHoja && (
        // El asa: se arrastra hacia arriba o hacia abajo. El botón de la cabecera hace lo mismo.
        <div
          data-testid="asa-cercanos"
          aria-hidden
          className="-mt-1.5 flex h-4 touch-none justify-center pt-1.5"
          onPointerDown={(e) => {
            arrastre.current = e.clientY;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            if (arrastre.current === null) return;
            cambiarAltura(alturaTrasArrastrar(altura, e.clientY - arrastre.current));
            arrastre.current = null;
          }}
          onPointerCancel={() => (arrastre.current = null)}
        >
          <span className="bg-linea h-1 w-9 rounded-full" />
        </div>
      )}
      <header className="flex items-center gap-2">
        {/* "Cercanos · en línea recta", y el aviso en la misma línea cuando lo hay (DEC-165). */}
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5">
          <h2 className="font-titulo text-[22px] leading-tight font-bold">{T.incidente.titulo}</h2>
          {origen && (
            <p data-subtitulo role={aviso ? 'status' : undefined} className="text-texto-suave text-[13px]">
              {/* Cada «·» va pegado a lo que sigue con un espacio duro: al partir la línea, el
                  separador baja con su texto y no se queda solo (docs/33 RV-316, D8). */}
              {SEP}
              {!desdeGps && <>{`${T.incidente.desdePuntoMarcado} ${SEP}`}</>}
              {T.incidente.lineaRecta}
              {aviso && (
                <>
                  {` ${SEP}`}
                  <span className="text-naranja-texto font-semibold whitespace-nowrap">{aviso}</span>
                </>
              )}
            </p>
          )}
          {origen && pocoPrecisa && (
            <button
              type="button"
              onClick={alMarcarEnMapa}
              className="text-texto -my-3 min-h-11 px-1 text-[13px] font-semibold underline"
            >
              {T.incidente.marcarEnMapa}
            </button>
          )}
        </div>
        {enHoja && (
          <button
            type="button"
            onClick={() => cambiarAltura(altura === 'alta' ? 'media' : 'alta')}
            aria-label={altura === 'alta' ? T.incidente.reducirHoja : T.incidente.ampliarHoja}
            title={altura === 'alta' ? T.incidente.reducirHoja : T.incidente.ampliarHoja}
            aria-expanded={altura === 'alta'}
            className="flex size-11 shrink-0 items-center justify-center"
          >
            {altura === 'alta' ? <ChevronDown size={20} aria-hidden /> : <ChevronUp size={20} aria-hidden />}
          </button>
        )}
        <button
          type="button"
          onClick={alCerrar}
          aria-label={T.incidente.cerrarIncidente}
          title={T.incidente.cerrarIncidente}
          className="flex size-11 shrink-0 items-center justify-center"
        >
          <X size={20} aria-hidden />
        </button>
      </header>

      {origen && alVolverALista && (
        <button type="button" onClick={alVolverALista} className={cn(boton, 'shrink-0 self-start')}>
          <List size={16} aria-hidden />
          {T.incidente.volverALista}
        </button>
      )}

      {!origen ? (
        <p
          role="status"
          className="bg-oro-100 border-oro-600 text-ambar-700 rounded-tarjeta border px-2.5 py-2 text-sm"
        >
          {buscando ? T.incidente.buscandoPosicion : T.incidente.sinPosicion}
        </p>
      ) : (
        <>
          {/* Un chip pequeño, pero con 44 px de alto para el dedo (UI-15). */}
          <label className="flex min-h-11 shrink-0 cursor-pointer items-center self-start">
            <span className="border-linea bg-papel rounded-chip flex items-center gap-2 border px-3 py-1.5 text-[14px]">
              <input
                type="checkbox"
                role="switch"
                checked={soloHidrantes}
                onChange={(e) => alCambiarSoloHidrantes(e.target.checked)}
                className="size-4"
              />
              {T.incidente.soloHidrantes}
            </span>
          </label>
          {candidatos.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-texto-suave text-sm">{T.incidente.vacio}</p>
              <button type="button" onClick={alVerLista} className={boton}>
                {T.incidente.verTodos}
              </button>
            </div>
          ) : (
            <ol className="flex flex-col gap-2">
              {candidatos.map((c) => (
                <li
                  key={c.punto.id}
                  className="bg-papel border-linea rounded-tarjeta flex items-center gap-2 border py-1.5 pr-1.5 pl-2.5"
                >
                  {/* Tocar la fila abre la ficha; el único botón es Cómo llegar (RV-114). */}
                  <button
                    type="button"
                    onClick={() => alElegir(c.punto.id)}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="flex w-[30px] shrink-0 justify-center">
                      <MarcadorSvg punto={c.punto} tamano={26} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-datos block text-[17px] leading-tight font-medium whitespace-nowrap">
                        {c.punto.codigo}
                      </span>
                      <span className="text-texto-suave block truncate text-[13.5px]">
                        {T.incidente.detalle(T.formato.mm(c.punto.diametro_mm), nombreCaudal(c.punto.caudal))}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      {/* --texto y no --marino-950: el marino no se lee sobre la tarjeta oscura (06 §2.4). */}
                      <span className="font-datos text-texto block text-[18px] leading-tight font-medium whitespace-nowrap">
                        {distancia(c.metros)}
                      </span>
                      <span className="text-texto-suave block text-[12.5px]">{rumboCorto(c.rumbo)}</span>
                    </span>
                  </button>
                  <a
                    href={enlaceComoLlegar(c.punto)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={T.ficha.comoLlegar}
                    title={T.ficha.comoLlegar}
                    // Principal de la fila: marino con el icono blanco. El borde de --texto lo separa de
                    // la tarjeta en oscuro, donde el marino casi no se distingue de ella.
                    className="bg-marino-950 border-texto rounded-boton flex size-11 shrink-0 items-center justify-center border-[1.5px] text-white"
                  >
                    <Navigation size={20} aria-hidden />
                  </a>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
