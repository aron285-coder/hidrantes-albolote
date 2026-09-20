import { Camera, Check } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import type { Caudal, Racor } from '@/tipos/punto';
import { type FotoProcesada, procesarFoto } from '@/lib/foto';
import { claseChip, nombreCaudal, nombreRacor } from '@/lib/ficha';
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

const CAUDALES: Caudal[] = ['bueno', 'regular', 'malo', 'no_funciona'];

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
    <div role="radiogroup" aria-label={etiqueta} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {CAUDALES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={valor === c}
          onClick={() => alCambiar(c)}
          className={cn(
            'rounded-chip min-h-11 border px-3 text-[15px] font-semibold',
            valor === c ? `${claseChip[c]} border-current` : 'border-linea bg-papel text-texto',
          )}
        >
          {nombreCaudal[c]}
        </button>
      ))}
    </div>
  );
}

const RACORES: Racor[] = ['granada', 'barcelona', 'otro'];

/**
 * Racor de la boca de riego (FR-20). Las fotos de referencia llegan cuando jefatura las haga
 * (DEC-063); hasta entonces, tarjetas con el nombre.
 */
export function SelectorRacor({ valor, alCambiar }: { valor?: Racor; alCambiar: (r: Racor) => void }) {
  return (
    <div role="radiogroup" aria-label={T.formulario.racor} className="grid grid-cols-3 gap-2">
      {RACORES.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={valor === r}
          onClick={() => alCambiar(r)}
          className={cn(
            'bg-papel rounded-tarjeta min-h-14 border px-2 text-[15px]',
            valor === r ? 'border-texto border-[3px] border-double font-semibold' : 'border-linea',
          )}
        >
          {nombreRacor(r)}
        </button>
      ))}
    </div>
  );
}

/** Foto obligatoria con la cámara (FR-21): se procesa en el móvil antes de guardarla (TR-15, TR-47). */
export function CampoFoto({
  etiqueta,
  foto,
  alCambiar,
}: {
  etiqueta: string;
  foto: FotoProcesada | null;
  alCambiar: (f: FotoProcesada | null) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [procesando, setProcesando] = useState(false);
  const [fallo, setFallo] = useState(false);

  async function elegida(archivo: File | undefined) {
    if (!archivo) return;
    setProcesando(true);
    setFallo(false);
    try {
      alCambiar(await procesarFoto(archivo));
    } catch {
      setFallo(true);
    } finally {
      setProcesando(false);
      if (entrada.current) entrada.current.value = '';
    }
  }

  return (
    <Campo etiqueta={etiqueta}>
      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/*"
        capture="environment"
        className="sr-only"
        aria-label={etiqueta}
        data-testid="entrada-foto"
        onChange={(e) => void elegida(e.target.files?.[0])}
      />
      {foto ? (
        <div className="bg-verde-100 text-verde-700 rounded-campo flex min-h-11 items-center gap-2 px-3 font-semibold">
          <Check size={18} aria-hidden />
          <span className="flex-1">{T.formulario.fotoAnadida(Math.round(foto.blob.size / 1024))}</span>
          <button type="button" className="min-h-11 px-1 underline" onClick={() => entrada.current?.click()}>
            {T.formulario.repetir}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={procesando}
          onClick={() => entrada.current?.click()}
          className="border-naranja-600 text-naranja-600 bg-papel rounded-campo flex min-h-11 items-center justify-center gap-2 border-[1.5px] px-3 font-semibold"
        >
          <Camera size={18} aria-hidden />
          {procesando ? T.operaciones.preparandoFoto : T.formulario.hacerFoto}
        </button>
      )}
      {fallo && <span className="text-rojo-700 text-[13px]">{T.operaciones.fotoIlegible}</span>}
    </Campo>
  );
}
