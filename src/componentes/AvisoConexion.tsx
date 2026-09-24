import { CloudOff, WifiOff } from 'lucide-react';
import { useConexion } from '@/hooks/estado';
import { reintentarAhora } from '@/lib/conexion';
import { T } from '@/lib/textos';

/** Banda bajo la barra superior cuando falta la red o el servidor (06 §5, FR-168). */
export function AvisoConexion() {
  const estado = useConexion();
  if (estado === 'bien') return null;
  const sinServidor = estado === 'sin_servidor';
  return (
    <div role="status" className="bg-gris-700 flex min-h-8 items-center gap-2 px-3 pt-2 text-[13px] text-white">
      {sinServidor ? <CloudOff size={16} aria-hidden /> : <WifiOff size={16} aria-hidden />}
      <span className="flex-1">{sinServidor ? T.mapa.sinServidor : T.mapa.sinCoberturaSolo}</span>
      {sinServidor && (
        <button type="button" className="min-h-11 px-2 font-semibold underline" onClick={() => void reintentarAhora()}>
          {T.mapa.reintentar}
        </button>
      )}
    </div>
  );
}
