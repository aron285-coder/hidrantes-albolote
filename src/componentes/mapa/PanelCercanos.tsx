import { ChevronDown, ChevronUp, List, Navigation, Ruler, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { BotonCompartir } from './Coordenadas';
import { MarcadorSvg } from './MarcadorSvg';
import type { LatLng } from '@/lib/coordenadas';
import { textoUbicacion } from '@/lib/compartir';
import { enlaceComoLlegar, nombreCaudal, nombreTipo } from '@/lib/ficha';
import { distancia, hace } from '@/lib/formato';
import { rumboCorto } from '@/lib/geometria';
import { type AlturaHoja, alturaHoja, alturaTrasArrastrar, guardarAlturaHoja } from '@/lib/hoja-cercanos';
import { type Candidato, PRECISION_POCA_M } from '@/lib/incidente';
import type { Punto } from '@/lib/puntos';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

export interface EstadoCercanos {
  /** Sin origen: se pidió "Cercanos" sin posición (FR-74). */
  origen: LatLng | null;
  desdeGps: boolean;
  /** Sin origen todavía: el GPS está buscando el primer fix (RV-59). */
  buscando: boolean;
  /** Precisión (m) y momento (ms) de la posición de origen, de la URL (RV-59). */
  precision: number | null;
  momento: number | null;
  /** Momento de la posición si ya no está al día (RV-40). */
  posicionVieja: number | null;
  candidatos: Candidato[];
  aviso: { punto: Punto; metros: number } | null;
  soloHidrantes: boolean;
  guardadoEn: number | null;
}

const boton =
  'bg-papel border-texto text-texto rounded-boton flex min-h-11 items-center justify-center gap-2 border-[1.5px] px-3 text-[14px] font-semibold';
/** Botón de icono de la fila: 44 × 44 (UI-13, TR-113). */
const icono =
  'bg-papel border-texto text-texto rounded-boton flex size-11 shrink-0 items-center justify-center border-[1.5px]';

/**
 * Hoja "Cercanos" del modo incidente (FR-74, docs/18 GM-03): como mucho cinco puntos que funcionan,
 * en orden de distancia en línea recta, con rumbo y tramos. En el móvil y la tableta va abajo, en una
 * hoja; en ordenador ocupa la columna de la lista, y nunca flota sobre el plano ni tapa la ficha
 * (docs/19 RV-60).
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
  alMedir,
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
  /** "Medir tendido": la medición con la recta incidente → punto ya puesta (FR-76). */
  alMedir: (hasta: LatLng) => void;
}) {
  const {
    origen,
    desdeGps,
    buscando,
    precision,
    momento,
    posicionVieja,
    candidatos,
    aviso,
    soloHidrantes,
    guardadoEn,
  } = estado;
  // "Desde tu posición · ±12 m · hace 2 min": lo que se sabe del origen (RV-59).
  const desde = desdeGps
    ? [
        T.incidente.desdeTuPosicion,
        precision !== null ? T.incidente.precision(precision) : null,
        momento !== null ? hace(momento) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : T.incidente.desdePuntoMarcado;
  const pocoPrecisa = desdeGps && precision !== null && precision > PRECISION_POCA_M;
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
              'rounded-t-hoja absolute bottom-0 left-0 z-[600] pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-xl',
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
        <h2 className="flex-1 text-[15px] font-bold">
          {T.incidente.titulo}
          {origen && (
            <span className="text-texto-suave block text-[13px] font-normal">
              {desde} · {T.incidente.lineaRecta}
            </span>
          )}
        </h2>
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
      {origen && aviso && (
        // Una línea bajo la cabecera, no un bloque: así caben tres candidatos en el móvil (RV-61).
        <p role="alert" className="text-rojo-700 -mt-1.5 shrink-0 truncate text-[13px] font-semibold">
          {aviso.punto.caudal === 'no_funciona'
            ? T.incidente.masCercanoNoFunciona(aviso.punto.codigo, distancia(aviso.metros))
            : T.incidente.masCercanoMalo(aviso.punto.codigo, distancia(aviso.metros))}
        </p>
      )}

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
          {pocoPrecisa && (
            <div
              role="status"
              className="bg-oro-100 border-oro-600 text-ambar-700 rounded-tarjeta flex flex-col gap-1.5 border px-2.5 py-2 text-[13px]"
            >
              <p>{T.incidente.pocoPrecisa(precision)}</p>
              <button type="button" onClick={alMarcarEnMapa} className={cn(boton, 'self-start')}>
                {T.incidente.marcarEnMapa}
              </button>
            </div>
          )}
          {posicionVieja !== null && (
            <p
              role="status"
              className="bg-oro-100 border-oro-600 text-ambar-700 rounded-tarjeta border px-2.5 py-1.5 text-[13px]"
            >
              {T.incidente.posicionDe(hace(posicionVieja))}
            </p>
          )}
          <label className="flex min-h-11 items-center justify-between gap-3 text-[15px]">
            <span>{T.incidente.soloHidrantes}</span>
            <input
              type="checkbox"
              role="switch"
              checked={soloHidrantes}
              onChange={(e) => alCambiarSoloHidrantes(e.target.checked)}
              className="size-6"
            />
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
                  className="bg-papel border-linea rounded-tarjeta flex items-center gap-2 border py-1 pr-1 pl-2"
                >
                  {/* Fila compacta (RV-61): dos líneas y dos botones de icono de 44 px, 8 px entre ellos. */}
                  <button
                    type="button"
                    onClick={() => alElegir(c.punto.id)}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <MarcadorSvg punto={c.punto} tamano={24} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px]">
                        <b className="font-datos">{c.punto.codigo}</b> · {nombreTipo[c.punto.tipo].toLowerCase()}{' '}
                        {T.formato.mm(c.punto.diametro_mm)} · {nombreCaudal[c.punto.caudal].toLowerCase()}
                      </span>
                      <span className="font-datos text-texto-suave block truncate text-[12px]">
                        {T.incidente.fila(distancia(c.metros), rumboCorto(c.rumbo), T.incidente.tramos(c.tramos))} ·{' '}
                        {T.mapa.revisado(hace(c.punto.fecha_ultima_revision))}
                      </span>
                    </span>
                  </button>
                  <a
                    href={enlaceComoLlegar(c.punto)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={T.ficha.comoLlegar}
                    title={T.ficha.comoLlegar}
                    className={icono}
                  >
                    <Navigation size={20} aria-hidden />
                  </a>
                  <button
                    type="button"
                    onClick={() => alMedir(c.punto)}
                    aria-label={T.medir.tendido}
                    title={T.medir.tendido}
                    className={icono}
                  >
                    <Ruler size={20} aria-hidden />
                  </button>
                </li>
              ))}
            </ol>
          )}
          <div className="flex flex-wrap gap-2">
            <BotonCompartir
              titulo={T.incidente.diana}
              texto={textoUbicacion(origen)}
              etiqueta={T.incidente.compartirIncidente}
              className="flex-1"
            />
          </div>
          {guardadoEn && (
            <p className="text-texto-suave text-center text-[12px]">{T.incidente.datos(hace(guardadoEn))}</p>
          )}
        </>
      )}
    </section>
  );
}
