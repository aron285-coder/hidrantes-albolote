import { Camera, Check } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import type { Caudal, Racor } from '@/tipos/punto';
import {
  type FotoProcesada,
  type PerfilFoto,
  PERFIL_CONEXION,
  PERFIL_SITIO,
  cambiarFoto,
  procesarFoto,
} from '@/lib/foto';
import { claseChip, nombreCaudal, nombreRacor } from '@/lib/ficha';
import {
  type EstadoFoto,
  ORDEN_RACORES,
  type RacorConFoto,
  URL_FOTO_RACOR,
  estadoFotoRacor,
  marcarFotoRacor,
} from '@/lib/racores';
import { FotoDemasiadoGrande } from '@/lib/foto-grande';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

/** Etiqueta de campo de 06 §5: encima, 13 px 600, texto suave. */
export function Campo({ etiqueta, children, ayuda }: { etiqueta: string; children: ReactNode; ayuda?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-texto-suave text-[13px] font-semibold">{etiqueta}</span>
      {children}
      {ayuda && <span className="text-texto-suave text-[13px]">{ayuda}</span>}
    </div>
  );
}

/** Segmentado de 06 §5 (tipo, diámetro): opciones iguales, la activa en marino con blanco. */
export function Segmentado<V extends string | number>({
  opciones,
  valor,
  alCambiar,
  etiqueta,
}: {
  opciones: [V, string][];
  valor: V | undefined;
  alCambiar: (v: V) => void;
  etiqueta: string;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="border-linea rounded-campo flex overflow-hidden border">
      {opciones.map(([v, texto]) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={valor === v}
          onClick={() => alCambiar(v)}
          className={cn(
            'min-h-11 flex-1 px-2 text-[15px]',
            valor === v ? 'bg-texto text-fondo font-semibold' : 'bg-papel text-texto',
          )}
        >
          {texto}
        </button>
      ))}
    </div>
  );
}

const CAUDALES: Caudal[] = ['bueno', 'regular', 'malo', 'barro', 'no_funciona'];

/** Píldoras de estado (06 §5): la activa con el fondo y el texto de su color. */
export function PildorasCaudal({
  valor,
  alCambiar,
  etiqueta,
}: {
  valor?: Caudal;
  alCambiar: (c: Caudal) => void;
  etiqueta: string;
}) {
  return (
    // Rejilla 2 + 3 en el móvil (Bueno · Regular / Malo · Barro · No funciona) y una fila de cinco desde
    // sm; cada botón ≥ 44 px de alto y cabe a 360 px (docs/24 RV-102, DEC-149).
    <div role="radiogroup" aria-label={etiqueta} className="grid grid-cols-6 gap-2 sm:grid-cols-5">
      {CAUDALES.map((c, i) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={valor === c}
          onClick={() => alCambiar(c)}
          className={cn(
            'rounded-chip min-h-11 border px-1.5 text-[15px] leading-tight font-semibold sm:col-span-1',
            i < 2 ? 'col-span-3' : 'col-span-2',
            valor === c ? `${claseChip(c)} border-current` : 'border-linea bg-papel text-texto',
          )}
        >
          {nombreCaudal(c)}
        </button>
      ))}
    </div>
  );
}

/**
 * La foto encima del nombre: 48 × 48, y 40 × 40 por debajo de 400 px de ancho para que quepan las
 * cuatro tarjetas en una fila (RV-121). Mientras no se sabe si existe, se pide escondida; si no
 * carga (aún no la ha puesto el desarrollador, o no hay red ni caché), desaparece y el botón se ve
 * solo con el nombre, nunca con un icono roto. alt vacío: el nombre ya va en el botón.
 */
function FotoRacor({ racor }: { racor: RacorConFoto }) {
  const [estado, setEstado] = useState<EstadoFoto | undefined>(estadoFotoRacor(racor));
  if (estado === 'falta') return null;
  const fijar = (e: EstadoFoto) => {
    marcarFotoRacor(racor, e);
    setEstado(e);
  };
  return (
    <img
      src={URL_FOTO_RACOR[racor]}
      alt=""
      width={48}
      height={48}
      onLoad={() => fijar('ok')}
      onError={() => fijar('falta')}
      className={cn('rounded-campo mx-auto mb-1 size-10 object-cover min-[400px]:size-12', estado !== 'ok' && 'hidden')}
    />
  );
}

/**
 * Tipo de enganche de la boca de riego (FR-20; el dato es «racor»): cuatro tarjetas en una fila,
 * también a 360 px (RV-121); todas menos «Otro» con su foto de referencia.
 */
export function SelectorRacor({ valor, alCambiar }: { valor?: Racor; alCambiar: (r: Racor) => void }) {
  return (
    <div role="radiogroup" aria-label={T.formulario.racor} className="grid grid-cols-4 gap-1.5 min-[400px]:gap-2">
      {ORDEN_RACORES.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={valor === r}
          // Tocar la foto selecciona igual que tocar el nombre: es parte del botón.
          onClick={() => alCambiar(r)}
          className={cn(
            // Estrechas a 360 px: menos relleno y letra de 14 px para que «Barcelona» quepa entera.
            'bg-papel rounded-tarjeta flex min-h-14 min-w-0 flex-col items-center justify-center border px-1 py-1.5 text-[14px] min-[400px]:px-2 min-[400px]:text-[15px]',
            valor === r ? 'border-texto border-[3px] border-double font-semibold' : 'border-linea',
          )}
        >
          {r !== 'otro' && <FotoRacor racor={r} />}
          {nombreRacor(r)}
        </button>
      ))}
    </div>
  );
}

/**
 * Un hueco de foto con la cámara (FR-21): se procesa en el móvil antes de guardarla (TR-15, TR-47).
 * `compacto`: medio ancho, con una sola palabra encima del botón (las dos fotos del alta, RV-103).
 */
function HuecoFoto({
  etiqueta,
  foto,
  alCambiar,
  perfil = PERFIL_CONEXION,
  testId,
  compacto = false,
  textoHacer = T.formulario.hacerFoto,
}: {
  etiqueta: string;
  foto: FotoProcesada | null;
  alCambiar: (f: FotoProcesada | null) => void;
  perfil?: PerfilFoto;
  testId: string;
  compacto?: boolean;
  /** El texto del hueco vacío sin `compacto`: «obligatoria» u «opcional» según la operación (#563). */
  textoHacer?: string;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [procesando, setProcesando] = useState(false);
  /**
   * `repetida`: la nueva no se pudo leer y sigue la anterior (docs/31 RV-157). `grande`: demasiados
   * megapíxeles para abrirla en este móvil (docs/32 RV-244).
   */
  const [fallo, setFallo] = useState<'nueva' | 'repetida' | 'grande' | null>(null);

  async function elegida(archivo: File | undefined) {
    if (!archivo) return;
    setProcesando(true);
    setFallo(null);
    const anterior = foto;
    try {
      let grande = false;
      const bien = await cambiarFoto(
        anterior,
        () =>
          procesarFoto(archivo, perfil).catch((e: unknown) => {
            grande = e instanceof FotoDemasiadoGrande;
            throw e;
          }),
        alCambiar,
      );
      if (!bien) setFallo(grande ? 'grande' : anterior ? 'repetida' : 'nueva');
    } finally {
      setProcesando(false);
      if (entrada.current) entrada.current.value = '';
    }
  }

  return (
    <div data-testid={`hueco-${testId}`} className="flex min-w-0 flex-col gap-1">
      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/*"
        capture="environment"
        className="sr-only"
        aria-label={etiqueta}
        data-testid={testId}
        onChange={(e) => void elegida(e.target.files?.[0])}
      />
      {foto ? (
        <div
          className={cn(
            'rounded-campo flex min-h-11 items-center gap-2 px-3 font-semibold',
            // Si la nueva falló, la anterior no se pinta como recién hecha: el aviso va con ella.
            fallo === 'repetida' ? 'bg-ambar-100 text-ambar-700' : 'bg-verde-100 text-verde-700',
            compacto && 'flex-wrap gap-x-2 gap-y-0 py-1 text-[13px]',
          )}
        >
          <Check size={18} aria-hidden />
          <span className="flex-1">
            {compacto
              ? T.formulario.huecoHecho(etiqueta, Math.round(foto.blob.size / 1024))
              : T.formulario.fotoAnadida(Math.round(foto.blob.size / 1024))}
          </span>
          <button
            type="button"
            className="min-h-11 px-1 underline"
            aria-label={compacto ? T.formulario.repetirDe(etiqueta) : undefined}
            onClick={() => entrada.current?.click()}
          >
            {T.formulario.repetir}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={procesando}
          onClick={() => entrada.current?.click()}
          aria-label={compacto ? T.formulario.hacerFotoDe(etiqueta) : undefined}
          className="border-naranja-600 text-naranja-texto bg-papel rounded-campo flex min-h-11 items-center justify-center gap-2 border-[1.5px] px-3 font-semibold"
        >
          <Camera size={18} aria-hidden />
          {procesando ? T.operaciones.preparandoFoto : compacto ? etiqueta : textoHacer}
        </button>
      )}
      {fallo && (
        <span role="alert" className="text-rojo-700 text-[13px]">
          {fallo === 'grande'
            ? T.operaciones.fotoDemasiadoGrande
            : fallo === 'repetida'
              ? T.operaciones.fotoRepetidaIlegible
              : T.operaciones.fotoIlegible}
        </span>
      )}
    </div>
  );
}

/**
 * Una sola foto con la cámara: revisión, estado y retirada (obligatoria, FR-42, FR-43, FR-46) y
 * corregir datos (opcional, FR-44). `textoHacer` lo dice en el hueco (#563).
 */
export function CampoFoto({
  etiqueta,
  foto,
  alCambiar,
  textoHacer,
}: {
  etiqueta: string;
  foto: FotoProcesada | null;
  alCambiar: (f: FotoProcesada | null) => void;
  textoHacer: string;
}) {
  return (
    <Campo etiqueta={etiqueta}>
      <HuecoFoto etiqueta={etiqueta} foto={foto} alCambiar={alCambiar} testId="entrada-foto" textoHacer={textoHacer} />
    </Campo>
  );
}

/**
 * Las dos fotos del alta y de corregir ubicación (docs/24 RV-103), lado a lado: «Conexión», como
 * siempre, y «Sitio», un entorno para encontrarlo (1280 px). Las dos obligatorias.
 */
export function DosFotos({
  etiqueta,
  conexion,
  sitio,
  alCambiarConexion,
  alCambiarSitio,
}: {
  etiqueta: string;
  conexion: FotoProcesada | null;
  sitio: FotoProcesada | null;
  alCambiarConexion: (f: FotoProcesada | null) => void;
  alCambiarSitio: (f: FotoProcesada | null) => void;
}) {
  return (
    <Campo etiqueta={etiqueta}>
      <div className="grid grid-cols-2 gap-2">
        <HuecoFoto
          etiqueta={T.formulario.conexion}
          foto={conexion}
          alCambiar={alCambiarConexion}
          testId="entrada-foto"
          compacto
        />
        <HuecoFoto
          etiqueta={T.formulario.sitio}
          foto={sitio}
          alCambiar={alCambiarSitio}
          perfil={PERFIL_SITIO}
          testId="entrada-foto-sitio"
          compacto
        />
      </div>
    </Campo>
  );
}
