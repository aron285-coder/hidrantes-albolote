import { Activity, Check, Crosshair, Navigation, Pencil, PenLine, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Hoja } from '../Hoja';
import { BloqueCoordenadas, BotonCompartir } from './Coordenadas';
import { MarcadorSvg } from './MarcadorSvg';
import { useConexion } from '@/hooks/estado';
import { textoPunto } from '@/lib/compartir';
import { claseChip, enlaceComoLlegar, nombreCaudal, nombreRacor, nombreTipo, urlFoto } from '@/lib/ficha';
import { distancia, fechaCorta, hace } from '@/lib/formato';
import type { Posicion } from '@/lib/posicion';
import type { Operacion } from '@/lib/propuestas';
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
      // text-texto: el suave sobre bg-linea se queda en 4,28:1 (axe, docs/18 GM-05).
      <div className="bg-linea text-texto rounded-tarjeta flex aspect-video items-center justify-center text-sm">
        {url && conexion !== 'bien' ? T.ficha.fotoNoDisponible : T.ficha.sinFoto}
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="rounded-tarjeta relative block overflow-hidden">
      <img
        // CORS: la caché del Service Worker guarda la respuesta completa, no una opaca (RV-12).
        crossOrigin="anonymous"
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
 * Ficha de un punto (FR-66). Nunca muestra historial ni autores: la RPC no los trae. Desde aquí,
 * "Proponer un cambio" con las cinco operaciones (FR-67).
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
  const [operaciones, setOperaciones] = useState(false);
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
      {/* La nota de fallo solo vale mientras no funciona (docs/18 RV-42). */}
      {punto.caudal === 'no_funciona' && punto.descripcion_fallo && (
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
      {/* Coordenadas para dárselas a bomberos o al 112 (FR-75, docs/18 GM-05). */}
      <BloqueCoordenadas l={punto} />
      <button
        type="button"
        onClick={() => setOperaciones(true)}
        className="bg-papel border-texto text-texto rounded-boton mt-1 flex min-h-11 items-center justify-center gap-2 border-[1.5px] px-3 text-[15px] font-semibold"
      >
        <PenLine size={18} aria-hidden />
        {T.ficha.proponerCambio}
      </button>
      <div className="flex flex-wrap gap-2">
        <a
          href={enlaceComoLlegar(punto)}
          target="_blank"
          rel="noreferrer"
          className="bg-papel border-texto text-texto rounded-boton flex min-h-11 flex-1 items-center justify-center gap-2 border-[1.5px] px-3 text-[15px] font-semibold"
        >
          <Navigation size={18} aria-hidden />
          {T.ficha.comoLlegar}
        </a>
        <BotonCompartir titulo={punto.codigo} texto={textoPunto(punto)} className="flex-1" />
      </div>
      {operaciones && <HojaOperaciones punto={punto} alCerrar={() => setOperaciones(false)} />}
    </article>
  );
}

const OPERACIONES: [Operacion, string, string, typeof Check][] = [
  ['revision', T.operaciones.sigueIgual, T.operaciones.sigueIgualDetalle, Check],
  ['estado', T.operaciones.actualizarEstado, T.operaciones.actualizarEstadoDetalle, Activity],
  ['datos', T.operaciones.corregirDatos, T.operaciones.corregirDatosDetalle, Pencil],
  ['ubicacion', T.operaciones.corregirUbicacion, T.operaciones.corregirUbicacionDetalle, Crosshair],
  ['retirada', T.operaciones.proponerRetirada, T.operaciones.proponerRetiradaDetalle, X],
];

/** "¿Qué ha cambiado en HID-0147?": las cinco operaciones sobre un punto (FR-67, 07 §7.3). */
function HojaOperaciones({ punto, alCerrar }: { punto: Punto; alCerrar: () => void }) {
  const navegar = useNavigate();
  return (
    <Hoja titulo={T.operaciones.queHaCambiado(punto.codigo)} alCerrar={alCerrar}>
      <ul className="mt-1 flex flex-col">
        {OPERACIONES.map(([op, titulo, detalle, Icono]) => (
          <li key={op}>
            <button
              type="button"
              onClick={() => navegar(`/proponer/${op}?p=${encodeURIComponent(punto.id)}`)}
              className="border-linea flex min-h-14 w-full items-center gap-3 border-b px-1 text-left"
            >
              <span
                className={cn(
                  'rounded-campo flex size-9 shrink-0 items-center justify-center',
                  op === 'retirada'
                    ? 'bg-rojo-100 text-rojo-700'
                    : op === 'estado'
                      ? 'bg-ambar-100 text-ambar-700'
                      : 'bg-linea',
                )}
              >
                <Icono size={18} strokeWidth={1.75} aria-hidden />
              </span>
              <span>
                <span className="block text-[15px] font-semibold">{titulo}</span>
                <span className="text-texto-suave block text-[13px]">{detalle}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Hoja>
  );
}
