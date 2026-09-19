import { useNavigate } from 'react-router';
import { BarraSuperior } from '@/componentes/BarraSuperior';
import { Boton } from '@/componentes/Boton';
import { LimiteError } from '@/componentes/LimiteError';
import { salirDeGoogle } from '@/lib/acceso';
import { T } from '@/lib/textos';

/** Ruta /admin (FR-100). El panel llega en la Fase 7; hasta entonces, entrada y salida. */
export function PanelJefatura({ correo }: { correo: string }) {
  const navegar = useNavigate();
  return (
    <div className="flex flex-1 flex-col">
      <BarraSuperior titulo={T.jefatura.panel} jefatura />
      <LimiteError>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 p-6 text-center">
          <p className="text-texto-suave text-sm">{T.ajustes.sesionGoogle(correo)}</p>
          <p>{T.jefatura.proximamente}</p>
          <Boton onClick={() => navegar('/')}>{T.jefatura.irAlMapa}</Boton>
          <Boton variante="secundario" onClick={() => void salirDeGoogle()}>
            {T.ajustes.cerrarSesionGoogle}
          </Boton>
        </div>
      </LimiteError>
    </div>
  );
}
