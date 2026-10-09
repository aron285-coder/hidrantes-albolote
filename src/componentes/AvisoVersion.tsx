import { Bell, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Boton } from '@/componentes/Boton';
import { Hoja } from '@/componentes/Hoja';
import { EnPilaAvisos } from '@/componentes/PilaAvisos';
import { useCola } from '@/hooks/cola';
import { useVersionNueva } from '@/hooks/version';
import { enFormulario, escucharAvisosPush } from '@/lib/aviso-formulario';
import {
  alPedirRecarga,
  debeActualizarAlVolver,
  pedirRecarga,
  queHacerAlRecargar,
  recargar,
  soloEnMemoria,
} from '@/lib/pwa';
import { ORDEN_AVISO } from '@/lib/orden-avisos';
import { T } from '@/lib/textos';

type Pregunta =
  | { tipo: 'recargar' }
  | { tipo: 'ir'; ruta: string }
  // Envíos solo en memoria (docs/32 RV-230): primero se avisa y luego, si insiste, se confirma.
  | { tipo: 'memoria'; paso: 'aviso' | 'confirmar' };

/**
 * Aviso de versión nueva (TR-24): abajo, sobre la navegación, hasta que se recargue (en el panel, en la
 * pila de arriba; docs/33 RV-313). Y el de una
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

  // En el panel de jefatura el aviso sigue arriba, en la pila: abajo taparía sus barras de acciones
  // (Aprobar, Rechazar), que van pegadas abajo.
  const enPanel = pathname.startsWith('/admin');
  // El mapa y la lista miden la pantalla (Armazon): ahí suben sus botones de abajo con --aviso-abajo.
  // En las demás pantallas la página crece lo que ocupa el aviso, para que su final no quede debajo.
  const aPantalla = ['/', '/lista'].includes(pathname.replace(/\/+$/, '') || '/');

  // Lo que ocupa el aviso de abajo (docs/33 RV-313).
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = caja.current;
    const raiz = document.documentElement;
    if (!hay || enPanel || !el) return;
    const anotar = () => {
      const alto = `${Math.ceil(el.offsetHeight) + 16}px`;
      raiz.style.setProperty('--aviso-abajo', alto);
      document.body.style.paddingBottom = aPantalla ? '' : alto;
    };
    anotar();
    const vigilar = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(anotar);
    vigilar?.observe(el);
    return () => {
      vigilar?.disconnect();
      raiz.style.removeProperty('--aviso-abajo');
      document.body.style.paddingBottom = '';
    };
  }, [hay, enPanel, aPantalla, formulario]);

  // Qué hacer al pedir la versión nueva (el botón, Ajustes o la vuelta al mapa): recargar, o preguntar
  // antes si hay un formulario a medias o envíos solo en memoria (RV-230).
  const atender = useCallback((enFormularioAhora: boolean) => {
    const hacer = queHacerAlRecargar(enFormularioAhora);
    if (hacer === 'recargar') recargar();
    else setPregunta(hacer === 'memoria' ? { tipo: 'memoria', paso: 'aviso' } : { tipo: 'recargar' });
  }, []);

  // Con un formulario abierto no se ofrece actualizar: se hace al volver al mapa. Se decide aquí mismo
  // y no con `pedirRecarga`: al cambiar de ruta, el oyente de abajo se está volviendo a apuntar y la
  // petición se perdería sin decir nada.
  const veniaDeFormulario = useRef(false);
  useEffect(() => {
    if (!hay) return;
    if (formulario) veniaDeFormulario.current = true;
    else if (debeActualizarAlVolver(veniaDeFormulario.current, pathname)) {
      veniaDeFormulario.current = false;
      atender(false);
    }
  }, [hay, formulario, pathname, atender]);

  // «Actualizar» del aviso o de Ajustes: se decide aquí, que es quien pregunta.
  useEffect(() => alPedirRecarga(() => atender(formulario)), [formulario, atender]);
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
      {/* Siempre montada, para que el lector de pantalla anuncie el aviso cuando llega. */}
      <p role="status" className="sr-only">
        {hay ? (formulario ? T.version.alTerminar : T.version.hay) : ''}
      </p>
      {hay && enPanel && (
        <EnPilaAvisos orden={ORDEN_AVISO.version}>
          <div className="bg-marino-950 rounded-boton flex items-center gap-2 py-1 pr-1 pl-3 text-sm text-white shadow-lg">
            <RefreshCw size={18} aria-hidden className="shrink-0" />
            <span className="flex-1 font-semibold">{T.version.hay}</span>
            <button
              type="button"
              onClick={pedirRecarga}
              className="rounded-boton text-marino-950 min-h-11 shrink-0 bg-white px-3 font-semibold"
            >
              {T.version.actualizar}
            </button>
          </div>
        </EnPilaAvisos>
      )}
      {hay && !enPanel && (
        // Abajo, sobre la navegación (docs/33 RV-313, U4): fijo, no empuja el contenido ni tapa el
        // buscador. Los botones de abajo del mapa suben lo que ocupa (--aviso-abajo).
        <div
          ref={caja}
          data-testid="aviso-version"
          className="bg-marino-950 rounded-tarjeta fixed inset-x-3 bottom-[calc(var(--nav-abajo,0px)+8px)] z-40 mx-auto flex max-w-md items-center gap-2 py-1 pr-1 pl-3 text-sm text-white shadow-lg"
        >
          <RefreshCw size={18} aria-hidden className="shrink-0" />
          {formulario ? (
            // En un formulario no se ofrece: se actualizará al volver al mapa.
            <p className="py-2">{T.version.alTerminar}</p>
          ) : (
            <>
              <p className="flex-1 font-semibold">{T.version.hay}</p>
              <button
                type="button"
                onClick={pedirRecarga}
                className="rounded-boton text-marino-950 min-h-11 shrink-0 bg-white px-3 font-semibold"
              >
                {T.version.actualizar}
              </button>
            </>
          )}
        </div>
      )}
      {aviso && (
        // Arriba, en la pila de avisos: abajo taparía Enviar (RV-238).
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
