import { CloudOff, Lock } from 'lucide-react';
import { BarraSuperior } from '@/componentes/BarraSuperior';
import { Boton } from '@/componentes/Boton';
import { reintentarComprobacion, volverAEntrada } from '@/lib/acceso';
import { T } from '@/lib/textos';

/**
 * Cuenta de Google que no está en `administradores` (FR-37); la sesión ya se ha cerrado. Con
 * `sinComprobar`, no se ha podido saber si lo está (docs/35 RV-432): se reintenta a mano, y mientras
 * tanto la app enseña «Comprobando tu cuenta…». Con `cuentaMezclada`, la cuenta tiene otra identidad
 * unida y no se une (docs/36 RV-450): «No autorizado» de siempre, con su explicación. Con `otraCuenta`, el
 * correo de jefatura ya está unido a otra cuenta de Google (docs/37 RV-493): qué hacer.
 */
export function NoAutorizado({
  sinComprobar = false,
  cuentaMezclada = false,
  otraCuenta = false,
}: {
  sinComprobar?: boolean;
  cuentaMezclada?: boolean;
  otraCuenta?: boolean;
}) {
  const detalle = sinComprobar
    ? T.entrada.cuentaSinComprobarDetalle
    : cuentaMezclada
      ? T.entrada.cuentaMezcladaDetalle
      : otraCuenta
        ? T.entrada.otraCuentaDetalle
        : T.entrada.noAutorizadoDetalle;
  const Icono = sinComprobar ? CloudOff : Lock;
  return (
    <div className="flex flex-1 flex-col">
      <BarraSuperior titulo={sinComprobar ? T.navegacion.jefatura : T.entrada.sinAcceso} />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Icono size={32} className="text-texto-suave" aria-hidden />
        <h2 className="font-titulo text-xl font-bold">
          {sinComprobar ? T.entrada.cuentaSinComprobar : T.entrada.noAutorizado}
        </h2>
        <p className="text-texto-suave text-sm">{detalle}</p>
        {sinComprobar && (
          <Boton className="mt-4 w-full" onClick={() => void reintentarComprobacion()}>
            {T.entrada.reintentar}
          </Boton>
        )}
        <Boton variante="secundario" className={sinComprobar ? 'w-full' : 'mt-4 w-full'} onClick={volverAEntrada}>
          {T.entrada.volver}
        </Boton>
      </div>
    </div>
  );
}
