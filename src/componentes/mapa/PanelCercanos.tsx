import { Navigation, X } from 'lucide-react';
import { BotonCompartir } from './Coordenadas';
import { MarcadorSvg } from './MarcadorSvg';
import type { LatLng } from '@/lib/coordenadas';
import { textoUbicacion } from '@/lib/compartir';
import { enlaceComoLlegar, nombreCaudal, nombreTipo } from '@/lib/ficha';
import { distancia, hace } from '@/lib/formato';
import { rumboCorto } from '@/lib/geometria';
import type { Candidato } from '@/lib/incidente';
import type { Punto } from '@/lib/puntos';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

export interface EstadoCercanos {
  /** Sin origen: se pidió "Cercanos" sin posición (FR-74). */
  origen: LatLng | null;
  desdeGps: boolean;
  /** Momento de la posición si ya no está al día (RV-40). */
  posicionVieja: number | null;
  candidatos: Candidato[];
  aviso: { punto: Punto; metros: number } | null;
  soloHidrantes: boolean;
  guardadoEn: number | null;
}

const boton =
  'bg-papel border-texto text-texto rounded-boton flex min-h-11 items-center justify-center gap-2 border-[1.5px] px-3 text-[14px] font-semibold';

/**
 * Hoja "Cercanos" del modo incidente (FR-74, docs/18 GM-03): como mucho cinco puntos que funcionan,
 * en orden de distancia en línea recta, con rumbo y tramos. En el móvil va abajo y deja ver el mapa;
 * en tableta y ordenador flota a la izquierda para no tapar la ficha.
 */
export function PanelCercanos({
  estado,
  enHoja,
  alCerrar,
  alCambiarSoloHidrantes,
  alElegir,
  alVerLista,
}: {
  estado: EstadoCercanos;
  enHoja: boolean;
  alCerrar: () => void;
  alCambiarSoloHidrantes: (si: boolean) => void;
  alElegir: (id: string) => void;
  alVerLista: () => void;
}) {
  const { origen, desdeGps, posicionVieja, candidatos, aviso, soloHidrantes, guardadoEn } = estado;
  return (
    <section
      aria-label={T.incidente.titulo}
      className={cn(
        'bg-fondo absolute z-[600] flex flex-col gap-2 overflow-y-auto p-3 shadow-xl',
        enHoja
          ? 'rounded-t-hoja inset-x-0 bottom-0 max-h-[45%] pb-[max(0.75rem,env(safe-area-inset-bottom))]'
          : 'rounded-tarjeta top-16 left-2 max-h-[calc(100%-5rem)] w-[min(360px,calc(100%-5rem))]',
      )}
    >
      <header className="flex items-center gap-2">
        <h2 className="flex-1 text-[15px] font-bold">
          {T.incidente.titulo}
          {origen && (
            <span className="text-texto-suave block text-[13px] font-normal">
              {desdeGps ? T.incidente.desdeTuPosicion : T.incidente.desdePuntoMarcado} · {T.incidente.lineaRecta}
            </span>
          )}
        </h2>
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

      {!origen ? (
        <p
          role="status"
          className="bg-oro-100 border-oro-600 text-ambar-700 rounded-tarjeta border px-2.5 py-2 text-sm"
        >
          {T.incidente.sinPosicion}
        </p>
      ) : (
        <>
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
          {aviso && (
            <p
              role="alert"
              className="bg-rojo-100 text-rojo-700 rounded-tarjeta px-2.5 py-1.5 text-[13px] font-semibold"
            >
              {aviso.punto.caudal === 'no_funciona'
                ? T.incidente.masCercanoNoFunciona(aviso.punto.codigo, distancia(aviso.metros))
                : T.incidente.masCercanoMalo(aviso.punto.codigo, distancia(aviso.metros))}
            </p>
          )}
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
                <li key={c.punto.id} className="bg-papel border-linea rounded-tarjeta border p-2">
                  <button
                    type="button"
                    onClick={() => alElegir(c.punto.id)}
                    className="flex min-h-11 w-full items-center gap-2 text-left"
                  >
                    <MarcadorSvg punto={c.punto} tamano={24} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px]">
                        <b className="font-datos">{c.punto.codigo}</b> · {nombreTipo[c.punto.tipo].toLowerCase()}{' '}
                        {T.formato.mm(c.punto.diametro_mm)} · {nombreCaudal[c.punto.caudal].toLowerCase()}
                      </span>
                      <span className="font-datos text-texto-suave block text-[13px]">
                        {T.incidente.fila(distancia(c.metros), rumboCorto(c.rumbo), T.incidente.tramos(c.tramos))}
                      </span>
                    </span>
                  </button>
                  <div className="mt-2 flex gap-2">
                    <a
                      href={enlaceComoLlegar(c.punto)}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(boton, 'flex-1')}
                    >
                      <Navigation size={16} aria-hidden />
                      {T.ficha.comoLlegar}
                    </a>
                  </div>
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
