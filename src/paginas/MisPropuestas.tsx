import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { BarraSuperior } from '@/componentes/BarraSuperior';
import { Boton } from '@/componentes/Boton';
import { Hoja } from '@/componentes/Hoja';
import { LimiteError } from '@/componentes/LimiteError';
import { useConexion } from '@/hooks/estado';
import { useCola, useMisPropuestas } from '@/hooks/cola';
import { useReloj } from '@/hooks/reloj';
import { ATASCADO_MS, type EnCola, descartar } from '@/lib/cola';
import { hace } from '@/lib/formato';
import {
  type EstadoPropuesta,
  type PropuestaPropia,
  cargarMisPropuestas,
  marcarVistas,
  retirarPropuesta,
} from '@/lib/mis-propuestas';
import { ETIQUETA_OPERACION, textoFallo } from '@/lib/nombres-operacion';
import type { Operacion } from '@/lib/propuestas';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

const ESTADOS: Record<EstadoPropuesta | 'sin_enviar', [string, string]> = {
  sin_enviar: [T.misPropuestas.sinEnviar, 'bg-linea text-texto'],
  pendiente: [T.misPropuestas.pendiente, 'bg-ambar-100 text-ambar-700'],
  aprobada: [T.misPropuestas.aprobada, 'bg-verde-100 text-verde-600'],
  rechazada: [T.misPropuestas.rechazada, 'bg-rojo-100 text-rojo-700'],
  retirada_por_autor: [T.misPropuestas.retiradaPorTi, 'bg-linea text-texto'],
};

/** Correcciones de jefatura en texto legible: "diametro_mm: 70 · racor: granada". */
const textoCorrecciones = (c: Record<string, unknown> | null) =>
  c && Object.keys(c).length
    ? Object.entries(c)
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`)
        .join(' · ')
    : null;

function Tarjeta({
  operacion,
  codigo,
  estado,
  cuando,
  punteada,
  children,
  accion,
}: {
  operacion: Operacion;
  codigo: string | null;
  estado: keyof typeof ESTADOS;
  cuando: string;
  punteada?: boolean;
  children?: React.ReactNode;
  accion?: React.ReactNode;
}) {
  const [texto, clase] = ESTADOS[estado];
  return (
    <li className={cn('bg-papel border-linea rounded-tarjeta border px-3 py-2', punteada && 'border-dashed')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px]">
          <span className="text-texto-suave text-[13px] font-bold uppercase">{ETIQUETA_OPERACION[operacion]}</span>{' '}
          <b className="font-datos">{codigo ?? T.misPropuestas.nuevo}</b>
        </span>
        <span className={cn('rounded-chip px-2.5 py-0.5 text-[13px] font-semibold', clase)}>{texto}</span>
      </div>
      <div className="text-texto-suave flex items-center justify-between gap-2 text-[13px]">
        <span>{cuando}</span>
        {accion}
      </div>
      {children}
    </li>
  );
}

/** Mis propuestas (FR-91, FL-10): lo que falta por enviar y lo enviado con su resultado. */
export function MisPropuestas() {
  const navegar = useNavigate();
  const cola = useCola();
  const propias = useMisPropuestas();
  const conexion = useConexion();
  const ahora = useReloj();
  const [confirmar, setConfirmar] = useState<{ tipo: 'retirar' | 'descartar'; id: string } | null>(null);
  const cerrar = useCallback(() => setConfirmar(null), []);

  useEffect(() => {
    void cargarMisPropuestas().then(() => marcarVistas());
  }, []);

  // Una propuesta enviada ya está en la lista del servidor; la cola solo guarda lo que falta.
  const enviadas = propias.filter((p) => !cola.some((c) => c.clave_local === p.clave_local));
  const vacia = !cola.length && !enviadas.length;

  const retirable = (p: PropuestaPropia) => p.estado === 'pendiente' && conexion === 'bien';

  return (
    <div className="flex flex-1 flex-col">
      <BarraSuperior titulo={T.navegacion.misPropuestas} alVolver={() => navegar(-1)} />
      <LimiteError>
        <div className="mx-auto w-full max-w-lg p-3">
          {conexion !== 'bien' && propias.length > 0 && (
            <p className="text-texto-suave mb-2 text-[13px]">{T.misPropuestas.listaGuardada}</p>
          )}
          <ul className="flex flex-col gap-2">
            {cola.map((c: EnCola) => (
              <Tarjeta
                key={c.clave_local}
                operacion={c.args.operacion}
                codigo={c.codigo}
                estado="sin_enviar"
                cuando={hace(c.creada_en, new Date(ahora))}
                punteada
                accion={
                  c.fallo && (
                    <button
                      type="button"
                      className="text-rojo-700 min-h-11 underline"
                      onClick={() => setConfirmar({ tipo: 'descartar', id: c.clave_local })}
                    >
                      {T.misPropuestas.descartar}
                    </button>
                  )
                }
              >
                {c.fallo ? (
                  <p className="bg-rojo-100 text-rojo-700 rounded-campo mt-1 px-2 py-1 text-[13px]">
                    {textoFallo(c.fallo)}
                  </p>
                ) : (
                  ahora - c.creada_en > ATASCADO_MS && (
                    <p className="bg-ambar-100 text-ambar-700 rounded-campo mt-1 px-2 py-1 text-[13px]">
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
                cuando={hace(p.creada_en, new Date(ahora))}
                accion={
                  retirable(p) && (
                    <button
                      type="button"
                      className="text-texto min-h-11 underline"
                      onClick={() => setConfirmar({ tipo: 'retirar', id: p.id })}
                    >
                      {T.misPropuestas.retirar}
                    </button>
                  )
                }
              >
                {p.motivo_rechazo && (
                  <p className="bg-rojo-100 text-rojo-700 rounded-campo mt-1 px-2 py-1 text-[13px]">
                    {T.misPropuestas.motivo(p.motivo_rechazo)}
                  </p>
                )}
                {p.estado === 'aprobada' && textoCorrecciones(p.correcciones) && (
                  <p className="text-texto-suave mt-1 text-[13px]">
                    {T.misPropuestas.conCorrecciones(textoCorrecciones(p.correcciones)!)}
                  </p>
                )}
              </Tarjeta>
            ))}
          </ul>
          {vacia && <p className="text-texto-suave p-6 text-center">{T.misPropuestas.vacio}</p>}
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
          <Boton
            variante="destructivo"
            className="w-full"
            onClick={async () => {
              if (confirmar.tipo === 'retirar') await retirarPropuesta(confirmar.id);
              else await descartar(confirmar.id);
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
