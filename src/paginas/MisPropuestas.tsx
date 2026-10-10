import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { BarraSuperior } from '@/componentes/BarraSuperior';
import { NavegacionArriba } from '@/componentes/NavegacionArriba';
import { Boton } from '@/componentes/Boton';
import { Hoja } from '@/componentes/Hoja';
import { LimiteError } from '@/componentes/LimiteError';
import { useConexion, usePuntos } from '@/hooks/estado';
import { useCola, useMisPropuestas } from '@/hooks/cola';
import { useReloj } from '@/hooks/reloj';
import { ATASCADO_MS, type EnCola, descartar, reintentarFallido } from '@/lib/cola';
import { type Carga, avisoMisPropuestas } from '@/lib/aviso-mis-propuestas';
import { hace } from '@/lib/formato';
import {
  type EstadoPropuesta,
  type PropuestaPropia,
  cargarMisPropuestas,
  SESION_CAMBIADA,
  cargarYMarcarVistas,
  retirarPropuesta,
  textoErrorRetirar,
} from '@/lib/mis-propuestas';
import { ETIQUETA_OPERACION, textoEspera, textoFallo } from '@/lib/nombres-operacion';
import { textoCambios } from '@/lib/campos';
import { type PuntoAntes, lineaPropuesta } from '@/lib/linea-propuesta';
import type { Operacion } from '@/lib/propuestas';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

const ESTADOS: Record<EstadoPropuesta | 'sin_enviar', [string, string]> = {
  sin_enviar: [T.misPropuestas.sinEnviar, 'bg-linea text-texto'],
  pendiente: [
    T.misPropuestas.pendiente,
    'bg-tinte-ambar text-tinte-ambar-texto ring-1 ring-tinte-ambar-borde ring-inset',
  ],
  aprobada: [
    T.misPropuestas.aprobada,
    'bg-tinte-verde text-tinte-verde-texto ring-1 ring-tinte-verde-borde ring-inset',
  ],
  rechazada: [T.misPropuestas.rechazada, 'bg-tinte-rojo text-tinte-rojo-texto ring-1 ring-tinte-rojo-borde ring-inset'],
  retirada_por_autor: [T.misPropuestas.retiradaPorTi, 'bg-linea text-texto'],
};

/** Correcciones de jefatura en español: "Diámetro: 70 mm · Tipo de enganche: Granada" (UI-20, RV-23). */
const textoCorrecciones = (c: Record<string, unknown> | null) => textoCambios(c);

/**
 * Una propuesta, lo más simple posible (docs/33 RV-315, U6): arriba el código (o «Punto nuevo»), el
 * tipo de cambio en texto suave y el estado; debajo, una sola línea con lo que se propuso; después, si
 * lo hay, el motivo o lo que pasa con el envío; y abajo, cuándo y la acción.
 */
function Tarjeta({
  operacion,
  codigo,
  estado,
  linea,
  cuando,
  punteada,
  children,
  accion,
}: {
  operacion: Operacion;
  codigo: string | null;
  estado: keyof typeof ESTADOS;
  linea: string;
  cuando: string;
  punteada?: boolean;
  children?: React.ReactNode;
  accion?: React.ReactNode;
}) {
  const [texto, clase] = ESTADOS[estado];
  return (
    <li className={cn('bg-papel border-linea rounded-tarjeta border px-3 py-2', punteada && 'border-dashed')}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-2 text-[15px]">
          <b className={cn(codigo && 'font-datos')}>{codigo ?? T.misPropuestas.puntoNuevo}</b>
          <span className="text-texto-suave text-[13px]">{ETIQUETA_OPERACION[operacion]}</span>
        </span>
        <span className={cn('rounded-chip shrink-0 px-2.5 py-0.5 text-[13px] font-semibold', clase)}>{texto}</span>
      </div>
      {linea && (
        <p className="text-texto mt-0.5 truncate text-[15px]" title={linea}>
          {linea}
        </p>
      )}
      {children}
      <div className="text-texto-suave flex items-center justify-between gap-2 text-[13px]">
        <span>{cuando}</span>
        {accion}
      </div>
    </li>
  );
}

/** Mis propuestas (FR-91, FL-10): lo que falta por enviar y lo enviado con su resultado. */
export function MisPropuestas() {
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const cola = useCola();
  const propias = useMisPropuestas();
  const conexion = useConexion();
  const ahora = useReloj();
  const [confirmar, setConfirmar] = useState<{ tipo: 'retirar' | 'descartar'; id: string } | null>(null);
  const [errorRetirar, setErrorRetirar] = useState<string | null>(null);
  const cerrar = useCallback(() => {
    setConfirmar(null);
    setErrorRetirar(null);
  }, []);

  // Si la carga ha fallado se dice (docs/32 RV-241): sin lista, no es "todavía no has propuesto nada".
  const [carga, setCarga] = useState<Carga>('cargando');
  // Solo tras una carga buena se da lo resuelto por visto (RV-153).
  const cargar = useCallback(
    () =>
      cargarYMarcarVistas()
        .then((r) => setCarga(r.ok || r.codigo === SESION_CAMBIADA ? 'bien' : 'fallo'))
        .catch(() => setCarga('fallo')),
    [],
  );
  useEffect(() => {
    void cargar();
  }, [cargar]);
  const reintentar = () => {
    setCarga('cargando');
    void cargar();
  };

  // Una propuesta enviada ya está en la lista del servidor; la cola solo guarda lo que falta.
  const enviadas = propias.filter((p) => !cola.some((c) => c.clave_local === p.clave_local));

  const aviso = avisoMisPropuestas(carga, enviadas.length > 0, cola.length > 0, conexion);

  const retirable = (p: PropuestaPropia) => p.estado === 'pendiente' && conexion === 'bien';

  // Lo que tenía el punto, para «Regular → No funciona». Solo mientras la propuesta no se ha
  // resuelto: después, el punto guardado ya puede llevar lo propuesto (RV-315).
  const { puntos } = usePuntos();
  const porId = useMemo(() => new Map(puntos.map((p) => [p.id, p])), [puntos]);
  const antesDe = (puntoId: string | null): PuntoAntes | null => (puntoId ? (porId.get(puntoId) ?? null) : null);

  return (
    <div className="flex flex-1 flex-col">
      <BarraSuperior
        titulo={T.navegacion.misPropuestas}
        alVolver={() => navegar(-1)}
        // Va fuera del armazón, pero en el ordenador lleva la misma navegación de arriba (#625, U12).
        // Solo la abre el voluntario (RutasDentro): sin «Jefatura».
        navegacion={<NavegacionArriba pathname={pathname} jefatura={false} />}
      />
      <LimiteError>
        <div className="mx-auto w-full max-w-lg p-3">
          {aviso === 'sin_conexion' && (
            <p className="text-texto-suave mb-2 text-[13px]">{T.misPropuestas.listaGuardada}</p>
          )}
          {aviso === 'no_actualizada' && (
            <p role="status" className="text-texto-suave mb-2 flex items-center gap-3 text-[13px]">
              {T.misPropuestas.noActualizada}
              <button type="button" className="text-texto min-h-11 font-semibold underline" onClick={reintentar}>
                {T.misPropuestas.reintentar}
              </button>
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {cola.map((c: EnCola) => (
              <Tarjeta
                key={c.clave_local}
                operacion={c.args.operacion}
                codigo={c.codigo}
                estado="sin_enviar"
                linea={lineaPropuesta(c.args.operacion, c.args.datos, antesDe(c.args.punto_id))}
                cuando={hace(c.creada_en, new Date(ahora))}
                punteada
                accion={
                  c.fallo && (
                    // Reintentar sin confirmación; descartar, que pierde el envío, con ella y a ≥ 12 px (UI-13).
                    <span className="flex items-center gap-3">
                      <button
                        type="button"
                        data-variante="enlace"
                        className="text-texto min-h-11 underline"
                        onClick={() => void reintentarFallido(c.clave_local)}
                      >
                        {T.misPropuestas.reintentar}
                      </button>
                      <button
                        type="button"
                        data-variante="destructivo"
                        className="text-rojo-texto min-h-11 underline"
                        onClick={() => setConfirmar({ tipo: 'descartar', id: c.clave_local })}
                      >
                        {T.misPropuestas.descartar}
                      </button>
                    </span>
                  )
                }
              >
                {c.fallo ? (
                  <p className="bg-tinte-rojo text-tinte-rojo-texto rounded-campo mt-1 px-2 py-1 text-[13px] ring-1 ring-tinte-rojo-borde ring-inset">
                    {textoFallo(c.fallo)}
                  </p>
                ) : textoEspera(c, ahora) ? (
                  <p className="bg-tinte-ambar text-tinte-ambar-texto rounded-campo mt-1 px-2 py-1 text-[13px] ring-1 ring-tinte-ambar-borde ring-inset">
                    {textoEspera(c, ahora)}
                  </p>
                ) : (
                  ahora - c.creada_en > ATASCADO_MS && (
                    <p className="bg-tinte-ambar text-tinte-ambar-texto rounded-campo mt-1 px-2 py-1 text-[13px] ring-1 ring-tinte-ambar-borde ring-inset">
                      {T.misPropuestas.esperando24h}
                    </p>
                  )
                )}
              </Tarjeta>
            ))}
            {enviadas.map((p) => (
              <Tarjeta
                key={p.id}
                operacion={p.operacion}
                codigo={p.codigo}
                estado={p.estado}
                linea={lineaPropuesta(p.operacion, p.datos, p.estado === 'pendiente' ? antesDe(p.punto_id) : null)}
                cuando={hace(p.creada_en, new Date(ahora))}
                accion={
                  retirable(p) && (
                    // Un botón de 44 × 44 px como mínimo (D10, UI-15).
                    <Boton
                      variante="secundario"
                      className="px-3 text-sm"
                      onClick={() => setConfirmar({ tipo: 'retirar', id: p.id })}
                    >
                      {T.misPropuestas.retirar}
                    </Boton>
                  )
                }
              >
                {/* El motivo, en una línea de texto suave, sin recuadro (RV-315). */}
                {p.motivo_rechazo && (
                  <p className="text-texto-suave mt-0.5 text-[13px]">{T.misPropuestas.motivo(p.motivo_rechazo)}</p>
                )}
                {p.estado === 'aprobada' && textoCorrecciones(p.correcciones) && (
                  <p className="text-texto-suave mt-1 text-[13px]">
                    {T.misPropuestas.conCorrecciones(textoCorrecciones(p.correcciones)!)}
                  </p>
                )}
              </Tarjeta>
            ))}
          </ul>
          {aviso === 'vacia' && <p className="text-texto-suave p-6 text-center">{T.misPropuestas.vacio}</p>}
          {aviso === 'cargando' && (
            <p role="status" className="text-texto-suave p-6 text-center">
              {T.app.cargando}
            </p>
          )}
          {aviso === 'no_cargada' && (
            <div role="alert" className="flex flex-col items-center gap-2 p-6 text-center">
              <p className="text-texto">{T.misPropuestas.noCargada}</p>
              <button type="button" className="text-texto min-h-11 font-semibold underline" onClick={reintentar}>
                {T.misPropuestas.reintentar}
              </button>
            </div>
          )}
        </div>
      </LimiteError>

      {confirmar && (
        <Hoja
          titulo={confirmar.tipo === 'retirar' ? T.misPropuestas.confirmarRetirar : T.misPropuestas.confirmarDescartar}
          alCerrar={cerrar}
        >
          <p className="text-texto-suave mb-3 text-sm">
            {confirmar.tipo === 'retirar' ? T.misPropuestas.retirarDetalle : T.misPropuestas.descartarDetalle}
          </p>
          {errorRetirar && (
            <p
              role="alert"
              className="bg-tinte-rojo text-tinte-rojo-texto rounded-campo mb-3 px-2 py-1 text-sm ring-1 ring-tinte-rojo-borde ring-inset"
            >
              {errorRetirar}
            </p>
          )}
          <Boton
            variante="destructivo"
            className="w-full"
            onClick={async () => {
              if (confirmar.tipo === 'retirar') {
                // Si jefatura ya decidió o no hay red, se dice dentro del diálogo, que sigue abierto (UI-05).
                const r = await retirarPropuesta(confirmar.id);
                if (!r.ok) {
                  setErrorRetirar(textoErrorRetirar(r.codigo));
                  void cargarMisPropuestas();
                  return;
                }
              } else await descartar(confirmar.id);
              setConfirmar(null);
            }}
          >
            {confirmar.tipo === 'retirar' ? T.misPropuestas.retirar : T.misPropuestas.descartar}
          </Boton>
          <Boton variante="secundario" className="mt-3 w-full" onClick={cerrar}>
            {T.ajustes.cancelar}
          </Boton>
        </Hoja>
      )}
    </div>
  );
}
