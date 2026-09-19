import { useNavigate } from 'react-router';
import { BarraSuperior } from '@/componentes/BarraSuperior';
import { T } from '@/lib/textos';

/** Aviso legal y privacidad (11 §7), desde la entrada y desde Ajustes. */
export function Legal() {
  const navegar = useNavigate();
  // Abierto por enlace directo no hay a dónde volver: se va al inicio (UI-01).
  const volver = () => ((window.history.state as { idx?: number } | null)?.idx ? navegar(-1) : navegar('/'));
  return (
    <div className="flex flex-1 flex-col">
      <BarraSuperior titulo={T.entrada.avisoLegalTitulo} alVolver={volver} />
      <article className="mx-auto w-full max-w-prose space-y-3 px-3 py-4 text-[15px]">
        <h2 className="font-titulo text-lg font-bold">{T.legal.titulo}</h2>
        <p>{T.legal.introduccion}</p>
        {T.legal.secciones.map((s) => (
          <p key={s.titulo}>
            <strong>{s.titulo}</strong> {s.texto}
          </p>
        ))}
      </article>
    </div>
  );
}
