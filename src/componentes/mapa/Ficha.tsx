import { Navigation, X } from 'lucide-react';
import { useState } from 'react';
import { MarcadorSvg } from './MarcadorSvg';
import { useConexion } from '@/hooks/estado';
import { claseChip, enlaceComoLlegar, nombreCaudal, nombreRacor, nombreTipo, urlFoto } from '@/lib/ficha';
import { distancia, fechaCorta, hace } from '@/lib/formato';
import type { Posicion } from '@/lib/posicion';
import { type Punto, metros } from '@/lib/puntos';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

const Chip = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <span
    className={cn('rounded-chip inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[13px] font-semibold', className)}
  >
    {children}
  </span>
);

function Foto({ punto }: { punto: Punto }) {
  const url = urlFoto(punto.foto_path);
  const [fallo, setFallo] = useState(false);
  const conexion = useConexion();
  if (!url || fallo) {
    return (
      <div className="bg-linea text-texto-suave rounded-tarjeta flex aspect-video items-center justify-center text-sm">
        {url && conexion !== 'bien' ? T.ficha.fotoNoDisponible : T.ficha.sinFoto}
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="rounded-tarjeta relative block overflow-hidden">
      <img
        src={url}
        alt={punto.codigo}
        loading="lazy"
        onError={() => setFallo(true)}
        className="aspect-video w-full bg-[linear-gradient(135deg,#C9CFD6,#9AA8BE)] object-cover"
      />
      <span className="absolute right-1.5 bottom-1.5 rounded bg-[rgba(14,27,48,.6)] px-1.5 text-xs text-white">
        {T.ficha.ampliar}
      </span>
    </a>
  );
}

/**
 * Ficha de un punto (FR-66). Nunca muestra historial ni autores: la RPC no los trae. "Proponer un
 * cambio" llega con las operaciones (Fase 6, DEC-062).
 */
export function Ficha({
  punto,
  posicion,
  guardadoEn,
  alCerrar,
  conCabecera = true,
}: {
  punto: Punto;
  posicion: Posicion | null;
  guardadoEn: number | null;
  alCerrar: () => void;
  conCabecera?: boolean;
}) {
  const conexion = useConexion();
  const m = posicion ? metros(posicion, punto) : null;
  const revision = new Date(punto.fecha_ultima_revision);

  return (
    <article className="flex flex-col gap-2" aria-labelledby="ficha-codigo">
      {conCabecera && (
        <header className="flex items-center gap-2">
          <MarcadorSvg punto={punto} tamano={28} />
          <h2 id="ficha-codigo" className="font-datos flex-1 text-lg">
            {punto.codigo}
          </h2>
          <button
            type="button"
            onClick={alCerrar}
            aria-label={T.ficha.cerrar}
            className="flex size-11 items-center justify-center"
          >
            <X size={20} aria-hidden />
          </button>
        </header>
      )}
      {guardadoEn && (
        <p className="text-texto-suave text-center text-[13px]">
          {conexion === 'bien' ? T.ficha.datosSincronizados(hace(guardadoEn)) : T.ficha.datosDe(hace(guardadoEn))}
        </p>
      )}
      <Foto punto={punto} />
      <div className="flex flex-wrap gap-1.5">
        <Chip className="bg-linea text-texto">{nombreTipo[punto.tipo]}</Chip>
        <Chip className="bg-linea text-texto">{T.formato.mm(punto.diametro_mm)}</Chip>
        {punto.racor && <Chip className="bg-linea text-texto">{T.ficha.racor(nombreRacor(punto.racor))}</Chip>}
        <Chip className={claseChip[punto.caudal]}>
          <span className="size-2 rounded-full bg-current" aria-hidden />
          {nombreCaudal[punto.caudal]}
        </Chip>
      </div>
      {punto.descripcion_fallo && (
        <p className="bg-gris-100 rounded-tarjeta text-gris-700 px-2.5 py-2 text-sm">
          <strong>{T.ficha.fallo}</strong> {punto.descripcion_fallo}
        </p>
      )}
      <div className="bg-papel border-linea rounded-tarjeta flex justify-between gap-3 border px-2.5 py-2">
        <div>
          <div className="text-texto-suave text-[13px]">{T.ficha.direccion}</div>
          <div className="text-[15px] font-semibold">
            {punto.direccion ?? <span className="text-texto-suave font-normal">{T.ficha.sinDireccion}</span>}
            {punto.nucleo && ` · ${punto.nucleo}`}
          </div>
        </div>
        {m !== null && (
          <div className="text-right">
            <div className="text-texto-suave text-[13px]">{T.ficha.aTi}</div>
            <div className="text-[15px] font-semibold whitespace-nowrap">{distancia(m)}</div>
          </div>
        )}
      </div>
      <div className="bg-papel border-linea rounded-tarjeta border px-2.5 py-2">
        <div className="text-texto-suave text-[13px]">{T.ficha.ultimaRevision}</div>
        <div className={cn('text-[15px] font-semibold', punto.revision_caducada && 'text-rojo-700')}>
          {hace(revision)} · {fechaCorta(revision)}
          {punto.revision_caducada && ` · ${T.ficha.caducada}`}
        </div>
      </div>
      {punto.descripcion && (
        <p className="bg-papel border-linea rounded-tarjeta text-texto-suave border px-2.5 py-2 text-sm">
          {punto.descripcion}
        </p>
      )}
      <a
        href={enlaceComoLlegar(punto)}
        target="_blank"
        rel="noreferrer"
        className="bg-papel border-texto text-texto rounded-boton mt-1 flex min-h-11 items-center justify-center gap-2 border-[1.5px] px-4 text-[15px] font-semibold"
      >
        <Navigation size={18} aria-hidden />
        {T.ficha.comoLlegar}
      </a>
    </article>
  );
}
