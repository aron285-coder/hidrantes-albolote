import { Link } from 'react-router';
import { useCola } from '@/hooks/cola';
import { useConexion, usePuntos } from '@/hooks/estado';
import { useReloj } from '@/hooks/reloj';
import { ATASCADO_MS } from '@/lib/cola';
import { hace } from '@/lib/formato';
import { T } from '@/lib/textos';

/**
 * Sello de la última sincronización y número de puntos, siempre a la vista (06 §5, FR-80), con el
 * contador de envíos pendientes (FR-82) y el aviso de lo atascado más de 24 h (FR-83).
 */
export function BarraEstado() {
  const { puntos, guardadoEn, sincronizando } = usePuntos();
  const conexion = useConexion();
  const cola = useCola();
  const ahora = useReloj();
  const sello = !guardadoEn
    ? sincronizando
      ? T.mapa.sincronizando
      : T.ajustes.sinSincronizar
    : conexion === 'sin_cobertura'
      ? T.mapa.sinCobertura(hace(guardadoEn))
      : T.mapa.sincronizado(hace(guardadoEn));
  // Lo que oye el lector de pantalla: solo el estado, que cambia pocas veces. El sello con «hace N
  // min» cambia cada minuto y no se anuncia (docs/31 RV-157).
  const estado = !guardadoEn
    ? sincronizando
      ? T.mapa.sincronizando
      : T.ajustes.sinSincronizar
    : conexion === 'sin_cobertura'
      ? T.mapa.sinCoberturaSolo
      : T.mapa.sincronizadoSolo;
  const atascado = cola.some((c) => !c.fallo && ahora - c.creada_en > ATASCADO_MS);
  return (
    <div className="bg-papel border-linea border-b">
      <span role="status" className="sr-only">
        {estado}
      </span>
      <p className="text-texto-suave flex min-h-7 items-center justify-between gap-2 px-3 text-[13px]">
        <span>
          {sello} · {T.mapa.nPuntos(puntos.length)}
        </span>
        {cola.length > 0 && (
          // 44 × 44 de objetivo táctil (UI-15) sin cambiar la barra: el enlace sobresale por arriba y
          // por abajo con márgenes negativos, por encima del mapa, y la etiqueta de dentro se ve igual que antes.
          <Link
            to="/mis-propuestas"
            className="relative z-10 -my-2 inline-flex min-h-11 min-w-11 items-center justify-center"
          >
            <span className="rounded-chip bg-[var(--badge-pendiente-fondo)] px-2.5 py-0.5 font-semibold text-[var(--badge-pendiente-texto)]">
              {T.mapa.sinEnviar(cola.length)}
            </span>
          </Link>
        )}
      </p>
      {atascado && <p className="bg-ambar-100 text-ambar-700 px-3 py-1 text-[13px]">{T.misPropuestas.esperando24h}</p>}
    </div>
  );
}
