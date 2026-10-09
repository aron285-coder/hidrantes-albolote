import { Bell, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Boton } from '@/componentes/Boton';
import { Hoja } from '@/componentes/Hoja';
import { EnPilaAvisos } from '@/componentes/PilaAvisos';
import { useCola } from '@/hooks/cola';
import { useVersionNueva } from '@/hooks/version';
import { enFormulario, escucharAvisosPush } from '@/lib/aviso-formulario';
import { alPedirRecarga, pedirRecarga, queHacerAlRecargar, recargar, soloEnMemoria } from '@/lib/pwa';
import { ORDEN_AVISO } from '@/lib/orden-avisos';
import { T } from '@/lib/textos';

type Pregunta =
  | { tipo: 'recargar' }
  | { tipo: 'ir'; ruta: string }
  // Envíos solo en memoria (docs/32 RV-230): primero se avisa y luego, si insiste, se confirma.
  | { tipo: 'memoria'; paso: 'aviso' | 'confirmar' };

/**
 * Aviso de versión nueva (TR-24): arriba, bajo la barra, hasta que se recargue. Y el de una
 * notificación tocada con un formulario a medias (docs/31 RV-157): el Service Worker no navega y la
 * app lo enseña aquí. Desde un formulario, recargar o ir al aviso preguntan antes. Y recargar, desde
 * cualquier pantalla (también Ajustes), no se hace si hay envíos solo en memoria (docs/32 RV-230).
 */
export function AvisoVersion() {
  const hay = useVersionNueva();
  const { pathname } = useLocation();
  const navegar = useNavigate();
  const [aviso, setAviso] = useState<string | null>(null);
  const [pregunta, setPregunta] = useState<Pregunta | null>(null);
  const cerrarPregunta = useCallback(() => setPregunta(null), []);

  useEffect(() => escucharAvisosPush(setAviso), []);

  const formulario = enFormulario(pathname);
  const sinGuardar = soloEnMemoria(useCola());

  // «Recargar» del aviso o de Ajustes: se decide aquí, que es quien pregunta.
  useEffect(
    () =>
      alPedirRecarga(() => {
        const hacer = queHacerAlRecargar(formulario);
        if (hacer === 'recargar') recargar();
        else setPregunta(hacer === 'memoria' ? { tipo: 'memoria', paso: 'aviso' } : { tipo: 'recargar' });
      }),
    [formulario],
  );
  // Fuera del formulario el aviso sobra (y taparía los botones del mapa): lo resuelto se ve en Mis
  // propuestas. Estado derivado del render, el patrón de React para ello.
  if (aviso && !formulario) setAviso(null);
  // Fuera del formulario el aviso ya no hace falta: se va a donde llevaba sin preguntar.
  const ir = (ruta: string) => {
    setAviso(null);
    setPregunta(null);
    navegar(ruta);
  };

  return (
    <>
      {hay && (
        <EnPilaAvisos orden={ORDEN_AVISO.version}>
          <button
            type="button"
            onClick={pedirRecarga}
            className="bg-marino-700 rounded-boton flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-semibold text-white shadow-lg"
          >
            <RefreshCw size={18} aria-hidden />
            {T.ajustes.versionNueva}
          </button>
        </EnPilaAvisos>
      )}
      {aviso && (
        // Arriba, en la pila de avisos, bajo el de versión nueva si está: abajo taparía Enviar (RV-238).
        <EnPilaAvisos orden={ORDEN_AVISO.notificacion}>
          <div
            role="status"
            className="bg-marino-700 rounded-boton flex min-h-11 items-center gap-2 pl-3 text-sm font-semibold text-white shadow-lg"
          >
            <Bell size={18} aria-hidden />
            <span className="flex-1">{T.avisoFormulario.avisoNuevo}</span>
            <button
              type="button"
              className="min-h-11 px-3 underline"
              onClick={() => (formulario ? setPregunta({ tipo: 'ir', ruta: aviso }) : ir(aviso))}
            >
              {T.avisoFormulario.ver}
            </button>
            <button
              type="button"
              aria-label={T.avisoFormulario.cerrar}
              className="ml-2 flex size-11 items-center justify-center"
              onClick={() => setAviso(null)}
            >
              <X size={18} aria-hidden />
            </button>
          </div>
        </EnPilaAvisos>
      )}
      {pregunta?.tipo === 'memoria' && (
        <Hoja
          titulo={pregunta.paso === 'aviso' ? T.recarga.titulo : T.recarga.confirmarTitulo}
          alCerrar={cerrarPregunta}
        >
          {sinGuardar === 0 ? (
            // Mientras se leía el aviso se han guardado o enviado: ya no se pierde nada.
            <>
              <p className="text-texto-suave mb-3 text-sm">{T.recarga.yaGuardadas}</p>
              <Boton className="w-full" onClick={recargar}>
                {T.avisoFormulario.botonRecargar}
              </Boton>
            </>
          ) : pregunta.paso === 'aviso' ? (
            <>
              <p className="text-texto-suave mb-3 text-sm">{T.recarga.sinGuardar(sinGuardar)}</p>
              <Boton className="w-full" onClick={cerrarPregunta}>
                {T.recarga.esperar}
              </Boton>
              <Boton
                variante="secundario"
                className="mt-3 w-full"
                onClick={() => setPregunta({ tipo: 'memoria', paso: 'confirmar' })}
              >
                {T.recarga.igualmente}
              </Boton>
            </>
          ) : (
            <>
              <p className="text-texto-suave mb-3 text-sm">
                {T.recarga.sePierden(sinGuardar)}
                {formulario && <span className="block">{T.avisoFormulario.sePierde}</span>}
              </p>
              <Boton variante="destructivo" className="w-full" onClick={recargar}>
                {T.recarga.confirmar}
              </Boton>
              <Boton variante="secundario" className="mt-3 w-full" onClick={cerrarPregunta}>
                {T.recarga.esperar}
              </Boton>
            </>
          )}
        </Hoja>
      )}
      {pregunta && pregunta.tipo !== 'memoria' && (
        <Hoja
          titulo={pregunta.tipo === 'recargar' ? T.avisoFormulario.recargar : T.avisoFormulario.salir}
          alCerrar={cerrarPregunta}
        >
          <p className="text-texto-suave mb-3 text-sm">{T.avisoFormulario.sePierde}</p>
          <Boton
            variante="destructivo"
            className="w-full"
            onClick={() => (pregunta.tipo === 'recargar' ? recargar() : ir(pregunta.ruta))}
          >
            {pregunta.tipo === 'recargar' ? T.avisoFormulario.botonRecargar : T.avisoFormulario.botonSalir}
          </Boton>
          <Boton variante="secundario" className="mt-3 w-full" onClick={cerrarPregunta}>
            {T.avisoFormulario.seguir}
          </Boton>
        </Hoja>
      )}
    </>
  );
}
