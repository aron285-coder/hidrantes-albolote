import { X } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { Contexto, type TipoAviso } from './usar-panel';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

const DURACION_MS = 6000;

export function ProveedorPanel({ children }: { children: ReactNode }) {
  const [busqueda, buscar] = useState('');
  const [aviso, setAviso] = useState<{ texto: string; tipo: TipoAviso; n: number } | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);

  const avisar = useCallback((texto: string, tipo: TipoAviso = 'ok') => {
    clearTimeout(temporizador.current);
    setAviso((a) => ({ texto, tipo, n: (a?.n ?? 0) + 1 }));
    // Los errores se quedan hasta cerrarlos: que no se pierdan mientras se mira otra cosa.
    if (tipo === 'ok') temporizador.current = setTimeout(() => setAviso(null), DURACION_MS);
  }, []);

  const valor = useMemo(() => ({ busqueda, buscar, avisar }), [busqueda, avisar]);
  return (
    <Contexto.Provider value={valor}>
      {children}
      {aviso && (
        <div
          key={aviso.n}
          role={aviso.tipo === 'error' ? 'alert' : 'status'}
          className={cn(
            'rounded-boton fixed top-3 left-1/2 z-[1100] flex max-w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 items-start gap-2 py-2 pr-1 pl-4 text-sm text-white shadow-lg',
            aviso.tipo === 'ok' ? 'bg-verde-600' : 'bg-rojo-700',
          )}
        >
          <span className="flex-1 py-1">{aviso.texto}</span>
          <button
            type="button"
            onClick={() => setAviso(null)}
            aria-label={T.ficha.cerrar}
            className="flex size-8 shrink-0 items-center justify-center"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      )}
    </Contexto.Provider>
  );
}
