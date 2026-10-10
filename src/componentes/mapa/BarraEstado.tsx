import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Boton } from '@/componentes/Boton';
import { Hoja } from '@/componentes/Hoja';
import { useCola } from '@/hooks/cola';
import { useConexion, usePuntos } from '@/hooks/estado';
import { useReloj } from '@/hooks/reloj';
import { ATASCADO_MS, esperaTope } from '@/lib/cola';
import { reintentarAhora } from '@/lib/conexion';
import { estadoPuntos } from '@/lib/puntos';
import { type Punto, estadoAnunciado, pildora } from '@/lib/estado-sincro';
import { hace } from '@/lib/formato';
import { T } from '@/lib/textos';

const COLOR_PUNTO: Record<Punto, string> = {
  verde: 'var(--verde-600)',
  ambar: 'var(--amarillo-500)',
  gris: 'var(--gris-100)',
};

/**
 * El estado de la sincronización en la cabecera (docs/33 RV-311, U2; FR-80): una píldora a la derecha
 * de «Puntos de agua» en lugar de las franjas del sello y de la conexión. Sin servidor, lleva dentro
 * «Reintentar». Al tocarla, una hoja con el detalle y «Sincronizar ahora».
 */
export function EstadoSincro() {
  const { puntos, guardadoEn, sincronizando } = usePuntos();
  const conexion = useConexion();
  const cola = useCola();
  const ahora = useReloj();
  const [abierta, setAbierta] = useState(false);
  // «Reintentar» y «Sincronizar ahora» dicen que están trabajando y, si no sale, lo dicen (06 §9, UI-06).
  const [reintentando, setReintentando] = useState(false);
  const [fallo, setFallo] = useState(false);
  const p = pildora(conexion, guardadoEn, sincronizando, puntos.length, ahora);
  const sinRed = conexion === 'sin_cobertura';
  const sincronizarYa = async () => {
    const antes = estadoPuntos().guardadoEn;
    setReintentando(true);
    setFallo(false);
    try {
      await reintentarAhora();
    } finally {
      setReintentando(false);
    }
    // Sin una sincronización nueva, no ha salido: se dice, en vez de dejar la hoja igual que estaba.
    setFallo(estadoPuntos().guardadoEn === antes);
  };
  const abrir = (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => {
        setFallo(false);
        setAbierta(true);
      }}
      className="flex min-h-11 min-w-0 items-center gap-1.5 px-1.5 text-[13px] font-semibold whitespace-nowrap"
    >
      <span className="sr-only">{T.sincro.titulo}: </span>
      {p.tipo === 'sin_servidor' ? (
        <TriangleAlert size={14} aria-hidden className="shrink-0" />
      ) : (
        <span
          data-punto={p.punto}
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ background: COLOR_PUNTO[p.punto] }}
        />
      )}
      {/* En un móvil estrecho y con la etiqueta de jefatura, el texto se acorta; «Reintentar» no. */}
      <span className="truncate">{p.texto}</span>
    </button>
  );
  return (
    <div
      data-testid="estado-sincro"
      data-puntos={puntos.length}
      data-sincronizado={guardadoEn ? 'si' : 'no'}
      className="-mr-1.5 flex max-w-[62%] min-w-0 items-center"
    >
      <span role="status" className="sr-only">
        {estadoAnunciado(conexion, guardadoEn, sincronizando)}
      </span>
      {p.tipo === 'sin_servidor' ? (
        // La píldora de «sin servidor», con su «Reintentar» dentro (no otra franja).
        <span className="bg-gris-700 flex min-w-0 items-center rounded-full pl-1.5 text-white">
          {abrir}
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={() => void sincronizarYa()}
            disabled={reintentando}
            className="min-h-11 shrink-0 px-2 text-[13px] font-semibold underline underline-offset-2"
          >
            {reintentando ? T.mapa.sincronizando : T.mapa.reintentar}
          </button>
        </span>
      ) : (
        <span className="flex min-w-0 text-white">{abrir}</span>
      )}
      {abierta && (
        <Hoja titulo={T.sincro.titulo} alCerrar={() => setAbierta(false)}>
          <dl className="my-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
            <dt className="text-texto-suave">{T.sincro.ultima}</dt>
            <dd>{guardadoEn ? hace(guardadoEn, new Date(ahora)) : T.ajustes.sinSincronizar}</dd>
            <dt className="text-texto-suave">{T.sincro.puntos}</dt>
            <dd>{T.sincro.puntosGuardados(puntos.length)}</dd>
            {cola.length > 0 && (
              <>
                <dt className="text-texto-suave">{T.sincro.envios}</dt>
                <dd>
                  <Link to="/mis-propuestas" className="font-semibold underline underline-offset-2">
                    {T.mapa.sinEnviar(cola.length)}
                  </Link>
                </dd>
              </>
            )}
          </dl>
          <Boton
            className="w-full"
            disabled={sinRed || sincronizando || reintentando}
            onClick={() => void sincronizarYa()}
            aria-describedby={sinRed ? 'sincro-sin-red' : undefined}
          >
            {sincronizando || reintentando ? T.mapa.sincronizando : T.sincro.sincronizarAhora}
          </Boton>
          {fallo && !reintentando && !sinRed && (
            <p role="status" className="text-rojo-texto mt-2 text-[13px]">
              {T.sincro.noSeHaPodido}
            </p>
          )}
          {/* Un botón deshabilitado dice por qué (UI-03). */}
          {sinRed && (
            <p id="sincro-sin-red" className="text-texto-suave mt-2 text-[13px]">
              {T.mapa.necesitaCobertura}
            </p>
          )}
        </Hoja>
      )}
    </div>
  );
}

/**
 * Debajo de la cabecera, solo si hace falta: «N sin enviar» (FR-82) alineado a la derecha, en su
 * propia línea y sin colgar sobre el buscador (docs/33 RV-324), y el aviso de lo atascado más de 24 h
 * (FR-83).
 */
export function BarraEstado() {
  const cola = useCola();
  const ahora = useReloj();
  // Lo que espera por un tope no espera cobertura: Mis propuestas dice por qué espera (docs/32 RV-233).
  const atascado = cola.some((c) => !c.fallo && !esperaTope(c, ahora) && ahora - c.creada_en > ATASCADO_MS);
  if (cola.length === 0 && !atascado) return null;
  return (
    <div className="bg-papel border-linea border-b">
      {cola.length > 0 && (
        <p className="flex justify-end px-3 text-[13px]">
          {/* 44 × 44 de objetivo táctil (UI-15), dentro de su línea: no tapa nada (RV-243, RV-324). */}
          <Link to="/mis-propuestas" className="inline-flex min-h-11 min-w-11 items-center justify-center">
            <span className="rounded-chip bg-[var(--badge-pendiente-fondo)] px-2.5 py-0.5 font-semibold text-[var(--badge-pendiente-texto)]">
              {T.mapa.sinEnviar(cola.length)}
            </span>
          </Link>
        </p>
      )}
      {atascado && (
        <p className="bg-tinte-ambar text-tinte-ambar-texto px-3 py-1 text-[13px] ring-1 ring-tinte-ambar-borde ring-inset">
          {T.misPropuestas.esperando24h}
        </p>
      )}
    </div>
  );
}
