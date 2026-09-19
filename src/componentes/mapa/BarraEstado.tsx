import { useConexion, usePuntos } from '@/hooks/estado';
import { useReloj } from '@/hooks/reloj';
import { hace } from '@/lib/formato';
import { T } from '@/lib/textos';

/** Sello de la última sincronización y número de puntos, siempre a la vista (06 §5, FR-80). */
export function BarraEstado() {
  const { puntos, guardadoEn, sincronizando } = usePuntos();
  const conexion = useConexion();
  useReloj();
  const sello = !guardadoEn
    ? sincronizando
      ? T.mapa.sincronizando
      : T.ajustes.sinSincronizar
    : conexion === 'sin_cobertura'
      ? T.mapa.sinCobertura(hace(guardadoEn))
      : T.mapa.sincronizado(hace(guardadoEn));
  return (
    <p
      role="status"
      className="bg-papel border-linea text-texto-suave flex min-h-7 items-center justify-between gap-2 border-b px-3 text-[13px]"
    >
      <span>
        {sello} · {T.mapa.nPuntos(puntos.length)}
      </span>
    </p>
  );
}
