import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BarraSuperior } from '@/componentes/BarraSuperior';
import { Boton } from '@/componentes/Boton';
import { useConexion } from '@/hooks/estado';
import { rpc } from '@/lib/api';
import { VERSION } from '@/lib/entorno';
import { leerSesion } from '@/lib/sesion';
import { T } from '@/lib/textos';

/** "Algo no funciona en la aplicación" (FR-92, FL-11). Necesita servidor: no pasa por la cola. */
export function Incidencia() {
  const navegar = useNavigate();
  const conexion = useConexion();
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);
  // La pantalla desde la que se llegó, para que jefatura sepa dónde pasó (FR-92).
  const [ruta] = useState(
    () => (window.history.state as { usr?: { desde?: string } } | null)?.usr?.desde ?? '/ajustes',
  );

  const falta = !texto.trim() ? T.incidencia.describe : conexion !== 'bien' ? T.mapa.necesitaCobertura : null;

  async function enviar() {
    const sesion = leerSesion();
    if (!sesion || falta) return;
    setEnviando(true);
    setError(null);
    const r = await rpc('fn_reportar_incidencia', {
      token: sesion.token,
      descripcion: texto.trim(),
      version_app: VERSION,
      ruta,
    });
    setEnviando(false);
    if (r.ok) setHecho(true);
    else setError(r.codigo === 'CUOTA_INCIDENCIAS_AGOTADA' ? T.incidencia.cuota : T.entrada.sinServidor);
  }

  return (
    <div className="flex flex-1 flex-col">
      <BarraSuperior titulo={T.ajustes.algoNoFunciona} alVolver={() => navegar(-1)} />
      {hecho ? (
        <div
          role="status"
          className="mx-auto flex max-w-sm flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
        >
          <CheckCircle2 size={44} className="text-verde-600" aria-hidden />
          <h2 className="font-titulo text-2xl font-bold">{T.incidencia.enviado}</h2>
          <Boton className="mt-2 w-full" onClick={() => navegar('/ajustes', { replace: true })}>
            {T.entrada.volver}
          </Boton>
        </div>
      ) : (
        <form
          className="mx-auto flex w-full max-w-lg flex-col gap-3 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
        >
          <p className="text-texto-suave text-sm">{T.incidencia.intro}</p>
          <label className="text-texto-suave text-[13px] font-semibold">
            {T.incidencia.queHaPasado}
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={T.incidencia.ph}
              maxLength={2000}
              rows={5}
              className="bg-papel border-linea rounded-campo text-texto mt-1 block w-full border px-3 py-2 text-base font-normal"
            />
          </label>
          <p className="bg-papel border-linea rounded-tarjeta text-texto-suave border px-2.5 py-2 text-[13px]">
            {T.incidencia.seEnviaCon(VERSION)}
          </p>
          <Boton type="submit" disabled={!!falta || enviando} className="w-full">
            {T.ajustes.avisarJefatura}
          </Boton>
          {falta && <p className="text-texto-suave -mt-1 text-center text-[13px]">{falta}</p>}
          {error && (
            <p role="alert" className="text-rojo-700 text-center text-sm">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
