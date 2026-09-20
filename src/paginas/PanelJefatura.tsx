import { CloudOff, LogOut, Map as IconoMapa, Search } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { Link, NavLink, Navigate, Route, Routes } from 'react-router';
import { Escudo } from '@/componentes/Escudo';
import { LimiteError } from '@/componentes/LimiteError';
import { ProveedorPanel } from '@/componentes/panel/contexto';
import { usePanel } from '@/componentes/panel/usar-panel';
import { useCarga } from '@/hooks/carga';
import { useConexion } from '@/hooks/estado';
import { useReloj } from '@/hooks/reloj';
import { salirDeGoogle } from '@/lib/acceso';
import { reintentarAhora } from '@/lib/conexion';
import { hace } from '@/lib/formato';
import { contar } from '@/lib/panel/consultas';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

const ColaRevision = lazy(() => import('@/componentes/panel/ColaRevision'));

/** Cada cuánto se refresca el número de pendientes (FR-110). */
const REFRESCO_MS = 60_000;

interface Pestana {
  ruta: string;
  nombre: string;
  badge?: number | null;
  naranja?: boolean;
}

/** Ruta /admin (FR-100): panel de jefatura, escritorio primero y usable en tableta (TR-35). */
export function PanelJefatura({ correo }: { correo: string }) {
  return (
    <ProveedorPanel>
      <Armazon correo={correo} />
    </ProveedorPanel>
  );
}

function Armazon({ correo }: { correo: string }) {
  const pendientes = useCarga(
    () => contar((c) => c.from('propuestas').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente')),
    [],
    REFRESCO_MS,
  );
  const pestanas: Pestana[] = [
    { ruta: 'cola', nombre: T.panelCola.colaRevision, badge: pendientes.datos, naranja: true },
  ];
  return (
    <div className="bg-fondo flex min-h-dvh flex-col">
      <Cabecera correo={correo} />
      <AvisoServidor desde={pendientes.en} />
      <nav aria-label={T.jefatura.panel} className="border-linea flex overflow-x-auto border-b bg-fondo px-2">
        {pestanas.map((p) => (
          <NavLink
            key={p.ruta}
            to={`/admin/${p.ruta}`}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm whitespace-nowrap',
                isActive
                  ? 'border-naranja-600 bg-papel text-texto font-bold'
                  : 'text-texto-suave hover:text-texto border-transparent',
              )
            }
          >
            {p.nombre}
            {p.badge != null && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[11px] font-bold',
                  p.naranja && p.badge > 0 ? 'bg-naranja-600 text-white' : 'bg-gris-100 text-gris-700',
                )}
              >
                {p.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <main className="flex min-h-0 flex-1 flex-col">
        <LimiteError>
          <Suspense fallback={<p className="text-texto-suave p-6 text-sm">{T.panelCola.cargando}</p>}>
            <Routes>
              <Route index element={<Navigate to="cola" replace />} />
              <Route path="cola" element={<ColaRevision alCambiar={() => void pendientes.recargar()} />} />
              <Route path="*" element={<Navigate to="cola" replace />} />
            </Routes>
          </Suspense>
        </LimiteError>
      </main>
      <footer className="border-linea text-texto-suave border-t px-4 py-2 text-xs">{T.panel.atribucion}</footer>
    </div>
  );
}

function Cabecera({ correo }: { correo: string }) {
  const { busqueda, buscar } = usePanel();
  return (
    <header className="bg-barra flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-white">
      <div className="flex items-center gap-2">
        <Escudo className="size-8" />
        <h1 className="font-titulo text-[17px] font-semibold">{T.panel.titulo}</h1>
      </div>
      <label className="relative order-last w-full md:order-none md:w-auto md:max-w-md md:flex-1">
        <span className="sr-only">{T.panelCola.buscar}</span>
        <Search size={16} aria-hidden className="absolute top-1/2 left-3 -translate-y-1/2 text-[#B7C2D6]" />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => buscar(e.target.value)}
          placeholder={T.panelCola.buscar}
          className="rounded-campo min-h-10 w-full bg-white/10 pr-3 pl-9 text-sm text-white placeholder:text-[#B7C2D6]"
        />
      </label>
      <div className="ml-auto flex items-center gap-1 text-sm">
        <span className="hidden text-[#B7C2D6] lg:inline">{correo}</span>
        <Link to="/" className="flex min-h-11 items-center gap-1 rounded px-2 hover:bg-white/10">
          <IconoMapa size={16} aria-hidden />
          {T.jefatura.irAlMapa}
        </Link>
        <button
          type="button"
          onClick={() => void salirDeGoogle()}
          className="flex min-h-11 items-center gap-1 rounded px-2 hover:bg-white/10"
        >
          <LogOut size={16} aria-hidden />
          {T.panel.salir}
        </button>
      </div>
    </header>
  );
}

/** Aviso equivalente al del móvil cuando el servidor no responde (FR-168). */
function AvisoServidor({ desde }: { desde: number | null }) {
  const conexion = useConexion();
  useReloj();
  if (conexion === 'bien') return null;
  return (
    <div role="status" className="bg-rojo-700 flex min-h-9 items-center gap-2 px-4 text-[13px] text-white">
      <CloudOff size={16} aria-hidden />
      <span className="flex-1">
        {conexion === 'sin_cobertura' ? T.mapa.sinCoberturaSolo : T.panel.sinServidor}
        {desde != null && ` · ${T.panel.datosDe(hace(desde))}`}
      </span>
      <button type="button" className="min-h-9 px-2 font-semibold underline" onClick={() => void reintentarAhora()}>
        {T.mapa.reintentar}
      </button>
    </div>
  );
}
