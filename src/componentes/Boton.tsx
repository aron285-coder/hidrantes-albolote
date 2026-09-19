import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variante = 'primario' | 'secundario' | 'destructivo' | 'enlace';

const CLASES: Record<Variante, string> = {
  primario: 'bg-naranja-600 text-white',
  secundario: 'bg-papel text-texto border-[1.5px] border-texto',
  destructivo: 'bg-rojo-700 text-white',
  // --texto sirve en claro y en oscuro; --marino-700 no se lee sobre el fondo oscuro (06 §2.4).
  enlace: 'text-texto underline px-1 font-normal',
};

/** Botones de 06 §5: alto ≥ 44 px (UI-15), radio 9. Deshabilitado solo con motivo escrito (UI-02). */
export function Boton({
  variante = 'primario',
  className,
  type = 'button',
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      type={type}
      className={cn(
        'rounded-boton disabled:bg-linea disabled:text-texto-suave min-h-11 px-4 text-[15px] font-semibold disabled:cursor-not-allowed',
        CLASES[variante],
        className,
      )}
      {...resto}
    />
  );
}
