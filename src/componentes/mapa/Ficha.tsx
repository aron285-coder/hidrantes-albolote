import { Activity, Check, Crosshair, ImageOff, Navigation, Pencil, PenLine, Share2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Hoja } from '../Hoja';
import { BloqueCoordenadas } from './Coordenadas';
import { useConexion } from '@/hooks/estado';
import { compartir, textoPunto } from '@/lib/compartir';
import { bandaDe, enlaceComoLlegar, nombreCaudal, nombreRacor, nombreTipo, urlFoto } from '@/lib/ficha';
import { distancia, fechaCorta, hace } from '@/lib/formato';
import type { Posicion } from '@/lib/posicion';
import type { Operacion } from '@/lib/propuestas';
import { type Punto, metros } from '@/lib/puntos';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

/**
 * Una foto de la ficha. Sin foto no se enseña nada (docs/25 RV-108); si la hay pero no se puede
 * cargar (sin red ni caché), lo dice en vez de enseñar un icono roto o un hueco mudo (UI-05).
 * `etiqueta`: "Conexión · 1/2" cuando el punto tiene las dos fotos.
 */
function UnaFoto({
  fotoPath,
  alt,
  alto,
  etiqueta,
}: {
  fotoPath: string | null;
  alt: string;
  alto: string;
  etiqueta?: string;
}) {
  const url = urlFoto(fotoPath);
  const conexion = useConexion();
  // Con qué cobertura falló. Si falló sin cobertura y ya la hay, la foto se vuelve a pedir.
  const [falloCon, setFalloCon] = useState<string | null>(null);
  // «Reintentar» pinta una <img> nueva, que vuelve a pedir la foto.
  const [intento, setIntento] = useState(0);
  const fallo = falloCon !== null && !(conexion === 'bien' && falloCon !== 'bien');
  if (!url || fallo) {
    const sinCobertura = !!fotoPath && conexion !== 'bien';
    return (
      // Sin foto, o si no carga, una franja de 44 px y no un bloque: «Cómo llegar» sube a la primera
      // pantalla (docs/33 RV-314, U5). text-texto: el suave sobre bg-linea se queda en 4,28:1 (axe).
      <div
        data-testid="foto-franja"
        className="bg-linea text-texto rounded-tarjeta flex min-h-11 items-center gap-2 px-3 text-sm"
      >
        <ImageOff size={18} className="shrink-0" aria-hidden />
        {etiqueta && <span className="shrink-0 font-semibold">{etiqueta}</span>}
        <span className="min-w-0 flex-1">
          {!fotoPath ? T.ficha.sinFoto : sinCobertura ? T.ficha.fotoNoDisponible : T.ficha.fotoNoCarga}
        </span>
        {/* Reintentar solo si hay a quién pedirla: con cobertura y con dirección de la foto. Sin
            cobertura se vuelve a pedir sola al volver la señal. */}
        {fotoPath && url && !sinCobertura && (
          <button
            type="button"
            onClick={() => {
              setFalloCon(null);
              setIntento((n) => n + 1);
            }}
            className="text-texto -my-1 min-h-11 shrink-0 px-1 font-semibold underline"
          >
            {T.ficha.reintentarFoto}
          </button>
        )}
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="rounded-tarjeta relative block overflow-hidden">
      <img
        key={intento}
        // CORS: la caché del Service Worker guarda la respuesta completa, no una opaca (RV-12).
        crossOrigin="anonymous"
        src={url}
        alt={alt}
        loading="lazy"
        onError={() => setFalloCon(conexion)}
        // Con foto, como mucho 200 px de alto (docs/33 RV-314).
        className={cn('max-h-[200px] w-full bg-[linear-gradient(135deg,#C9CFD6,#9AA8BE)] object-cover', alto)}
      />
      {etiqueta && <EtiquetaFoto texto={etiqueta} />}
      <span className="absolute right-1.5 bottom-1.5 rounded bg-[rgba(14,27,48,.6)] px-1.5 text-xs text-white">
        {T.ficha.ampliar}
      </span>
    </a>
  );
}

const EtiquetaFoto = ({ texto }: { texto: string }) => (
  <span className="absolute bottom-1.5 left-1.5 rounded bg-[rgba(14,27,48,.78)] px-2 py-0.5 text-xs text-white">
    {texto}
  </span>
);

/** Al deslizar más de esto en horizontal se pasa a la otra foto. */
const DESLIZ_PX = 40;

/**
 * La foto de la conexión, como siempre, y, si la hay, la del sitio (FR-66, docs/24 RV-103): se pasa
 * de una a otra deslizando o con los dos botones de debajo, cada uno con su palabra. Las dos se
 * cargan solo con la ficha abierta.
 */
function Foto({ punto, alto }: { punto: Punto; alto: string }) {
  const [cual, setCual] = useState<'conexion' | 'sitio'>('conexion');
  const inicio = useRef<number | null>(null);
  const haySitio = !!punto.foto_sitio_path;
  if (!haySitio) return <UnaFoto fotoPath={punto.foto_path} alt={punto.codigo} alto={alto} />;
  const fotos = [
    ['conexion', punto.foto_path, T.formulario.conexion],
    ['sitio', punto.foto_sitio_path ?? null, T.formulario.sitio],
  ] as const;
  const n = fotos.findIndex(([c]) => c === cual);
  const actual = fotos[n]!;
  return (
    <div
      onTouchStart={(e) => (inicio.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const x0 = inicio.current;
        const x1 = e.changedTouches[0]?.clientX;
        inicio.current = null;
        if (x0 == null || x1 == null || Math.abs(x1 - x0) < DESLIZ_PX) return;
        setCual(x1 < x0 ? 'sitio' : 'conexion');
      }}
    >
      <UnaFoto
        key={actual[0]}
        fotoPath={actual[1]}
        alt={T.ficha.fotoDe(punto.codigo, actual[2])}
        alto={alto}
        etiqueta={T.ficha.fotoNumero(actual[2], n + 1, fotos.length)}
      />
      <div className="mt-1 flex justify-center gap-2">
        {fotos.map(([c, , nombre]) => (
          <button
            key={c}
            type="button"
            aria-pressed={cual === c}
            onClick={() => setCual(c)}
            className="text-texto flex min-h-11 items-center gap-1.5 px-2 text-[13px] font-semibold"
          >
            <span
              aria-hidden
              className={cn(
                'size-2 rounded-full',
                cual === c ? 'bg-texto' : 'border-texto-suave border bg-transparent',
              )}
            />
            {nombre}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Compartir como botón de icono de 46 px junto a "Cómo llegar" (docs/25 RV-108). Hace lo mismo que
 * el botón de Compartir de "¿Qué hay aquí?": menú del sistema, si no, al portapapeles, y si tampoco,
 * el texto a la vista para copiarlo a mano (UI-05).
 */
function CompartirIcono({ titulo, texto }: { titulo: string; texto: string }) {
  const [estado, setEstado] = useState<'copiado' | 'fallo' | null>(null);
  return (
    <>
      <button
        type="button"
        aria-label={T.compartir.boton}
        title={T.compartir.boton}
        onClick={() =>
          void compartir(titulo, texto).then((r) => setEstado(r === 'copiado' || r === 'fallo' ? r : null))
        }
        className="bg-papel border-texto text-texto rounded-boton flex size-[46px] shrink-0 items-center justify-center border-[1.5px]"
      >
        <Share2 size={20} aria-hidden />
      </button>
      {estado === 'copiado' && (
        <p role="status" className="text-texto-suave w-full text-[13px]">
          {T.compartir.copiado}
        </p>
      )}
      {estado === 'fallo' && (
        <div role="status" className="w-full">
          <p className="text-texto-suave text-[13px]">{T.compartir.noSePuede}</p>
          <textarea
            readOnly
            value={texto}
            aria-label={titulo}
            rows={4}
            className="border-linea rounded-campo font-datos mt-1 w-full border p-2 text-[13px] select-all"
          />
        </div>
      )}
    </>
  );
}

/** Una celda de la rejilla de datos fijos: etiqueta pequeña y valor. */
const Dato = ({ etiqueta, ancho, children }: { etiqueta: string; ancho?: boolean; children: React.ReactNode }) => (
  <div className={cn('bg-papel px-2.5 py-1.5', ancho && 'col-span-2')}>
    <dt className="text-texto-suave text-[12px]">{etiqueta}</dt>
    <dd className="text-[15px] font-semibold">{children}</dd>
  </div>
);

/**
 * Ficha de un punto (FR-66, docs/25 RV-108, DEC-156). De arriba abajo: la banda del color del
 * estado con la revisión, el código y el núcleo, la foto, los datos fijos, los botones, las
 * coordenadas y de cuándo son los datos. Nunca muestra historial ni autores: la RPC no los trae.
 * Desde aquí, "Proponer un cambio" con las cinco operaciones (FR-67).
 *
 * `conCabecera` es falso en el móvil: allí la ficha es una pantalla propia y su barra ya lleva el
 * código y la flecha de volver, así que la banda va sin X y el código no se repite a la vista (UI-16).
 * El contenedor tiene 12 px de margen (p-3): la banda los recupera para ir a todo el ancho.
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
  const banda = bandaDe(punto.caudal);
  const boca = punto.tipo === 'boca_riego';
  const direccion = punto.direccion ?? <span className="text-texto-suave font-normal">{T.ficha.sinDireccion}</span>;

  return (
    <article
      className="flex flex-col gap-2.5"
      {...(conCabecera ? { 'aria-labelledby': 'ficha-codigo' } : { 'aria-label': punto.codigo })}
    >
      <header
        data-banda={punto.caudal}
        className={cn(
          '-mx-3 -mt-3 flex items-center gap-2 py-2.5 pr-1.5 pl-3.5',
          conCabecera && 'rounded-t-tarjeta',
          banda.clase,
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="font-titulo text-[24px] leading-none font-bold tracking-[.4px] uppercase">
            {nombreCaudal(punto.caudal)}
          </p>
          <p className="mt-1 text-[13px]">
            {punto.revision_caducada
              ? T.ficha.sinRevisarDesde(hace(revision))
              : T.ficha.revisado(hace(revision), fechaCorta(revision))}
          </p>
        </div>
        {conCabecera && (
          <button
            type="button"
            onClick={alCerrar}
            aria-label={T.ficha.cerrar}
            className="flex size-11 shrink-0 items-center justify-center"
          >
            <X size={22} aria-hidden />
          </button>
        )}
      </header>
      <div className="flex items-baseline gap-2.5">
        {/* En el móvil el código ya es el título de la barra: aquí no se repite (UI-16). */}
        {conCabecera && (
          <h2 id="ficha-codigo" className="font-datos text-[21px] font-medium">
            {punto.codigo}
          </h2>
        )}
        <p className={cn('text-texto-suave text-[13.5px]', conCabecera && 'ml-auto text-right')}>
          {[punto.nucleo, m !== null ? T.ficha.aDistancia(distancia(m)) : null].filter(Boolean).join(' · ')}
        </p>
      </div>
      <Foto punto={punto} alto={conCabecera ? 'h-[170px]' : 'h-[150px]'} />
      <dl className="bg-linea border-linea rounded-tarjeta grid grid-cols-2 gap-px overflow-hidden border">
        <Dato etiqueta={T.ficha.tipo}>{nombreTipo[punto.tipo]}</Dato>
        <Dato etiqueta={T.ficha.diametro}>{T.formato.mm(punto.diametro_mm)}</Dato>
        {boca && punto.racor && <Dato etiqueta={T.ficha.enganche}>{nombreRacor(punto.racor)}</Dato>}
        <Dato etiqueta={T.ficha.direccion} ancho={!(boca && punto.racor)}>
          {direccion}
        </Dato>
      </dl>
      {/* La nota de fallo solo vale mientras no funciona (docs/18 RV-42). */}
      {punto.caudal === 'no_funciona' && punto.descripcion_fallo && (
        <p className="bg-gris-100 rounded-tarjeta text-gris-700 px-2.5 py-2 text-sm">
          <strong>{T.ficha.fallo}</strong> {punto.descripcion_fallo}
        </p>
      )}
      {punto.descripcion && (
        <p className="bg-papel border-linea rounded-tarjeta text-texto-suave border px-2.5 py-2 text-sm">
          {punto.descripcion}
        </p>
      )}
      {/* Un solo botón principal: Cómo llegar (06 §5, DEC-147). */}
      <div className="flex flex-wrap gap-2">
        <a
          href={enlaceComoLlegar(punto)}
          target="_blank"
          rel="noreferrer"
          data-variante="primario"
          // El borde --texto: en oscuro, el marino casi no se separa del fondo y el botón perdería su forma.
          className="bg-marino-950 border-texto rounded-boton flex border-[1.5px] min-h-[46px] flex-1 items-center justify-center gap-2 px-3 text-[15px] font-semibold text-white"
        >
          <Navigation size={18} aria-hidden />
          {T.ficha.comoLlegar}
        </a>
        <CompartirIcono titulo={punto.codigo} texto={textoPunto(punto)} />
      </div>
      <button
        type="button"
        onClick={() => setOperaciones(true)}
        className="bg-papel border-naranja-600 text-naranja-texto rounded-boton flex min-h-11 items-center justify-center gap-2 border-[1.5px] px-3 text-[15px] font-semibold"
      >
        <PenLine size={18} aria-hidden />
        {T.ficha.proponerCambio}
      </button>
      {/* Coordenadas para dárselas a bomberos o al 112 (FR-75, docs/18 GM-05; sistemas de RV-109). */}
      <BloqueCoordenadas l={punto} />
      {guardadoEn && (
        <p className="text-texto-suave text-center text-[13px]">
          {conexion === 'bien' ? T.ficha.datosSincronizados(hace(guardadoEn)) : T.ficha.datosDe(hace(guardadoEn))}
        </p>
      )}
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
