import { Lock } from 'lucide-react';
import { BarraSuperior } from '@/componentes/BarraSuperior';
import { Boton } from '@/componentes/Boton';
import { volverAEntrada } from '@/lib/acceso';
import { T } from '@/lib/textos';

/** Cuenta de Google que no está en `administradores` (FR-37). La sesión ya se ha cerrado. */
export function NoAutorizado() {
  return (
    <div className="flex flex-1 flex-col">
      <BarraSuperior titulo={T.entrada.sinAcceso} />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Lock size={32} className="text-texto-suave" aria-hidden />
        <h2 className="font-titulo text-xl font-bold">{T.entrada.noAutorizado}</h2>
        <p className="text-texto-suave text-sm">{T.entrada.noAutorizadoDetalle}</p>
        <Boton variante="secundario" className="mt-4 w-full" onClick={volverAEntrada}>
          {T.entrada.volver}
        </Boton>
      </div>
    </div>
  );
}
