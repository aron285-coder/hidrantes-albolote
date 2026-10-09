import { CloudOff, LogOut, Map as IconoMapa, Menu as IconoMenu, Search } from 'lucide-react';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes } from 'react-router';
import { Escudo } from '@/componentes/Escudo';
import { LimiteError } from '@/componentes/LimiteError';
import { ProveedorPanel } from '@/componentes/panel/contexto';
import { usePanel } from '@/componentes/panel/usar-panel';
import { useCarga } from '@/hooks/carga';
import { useConexion, usePuntos } from '@/hooks/estado';
import { useReloj } from '@/hooks/reloj';
import { salirDeGoogle } from '@/lib/acceso';
import { olvidarTemasJefatura } from '@/lib/panel/push-jefatura';
import { reintentarAhora } from '@/lib/conexion';
import { hace } from '@/lib/formato';
import { contar } from '@/lib/panel/consultas';
import { pedirEnvioComoJefatura } from '@/lib/panel/push-jefatura';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

const ColaRevision = lazy(() => import('@/componentes/panel/ColaRevision'));
const Inventario = lazy(() => import('@/componentes/panel/Inventario'));
const Registro = lazy(() => import('@/componentes/panel/Registro'));
const Papelera = lazy(() => import('@/componentes/panel/Papelera'));
const Ajustes = lazy(() => import('@/componentes/panel/Ajustes'));

/** Cada cuánto se refresca el número de pendientes (FR-110). */
const REFRESCO_MS = 60_000;

interface Pestana {
  ruta: string;
  nombre: string;
  badge?: number | null;
  naranja?: boolean;
}

/** Ruta /admin (FR-100): panel de jefatura, escritorio primero y usable en tableta (TR-35). Cinco pestañas (DEC-167). */
export function PanelJefatura({ correo }: { correo: string }) {
  return (
    <ProveedorPanel>
      <Armazon correo={correo} />
    </ProveedorPanel>
  );
}

function Armazon({ correo }: { correo: string }) {
  const { puntos } = usePuntos();
  const pendientes = useCarga(
    () => contar((c) => c.from('propuestas').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente')),
    [],
    REFRESCO_MS,
  );
  const enPapelera = useCarga(
    () => contar((c) => c.from('puntos').select('id', { count: 'exact', head: true }).eq('situacion', 'borrado')),
    [],
    REFRESCO_MS,
  );
  const recargarContadores = () => {
    void pendientes.recargar();
    void enPapelera.recargar();
  };
  // Al abrir el panel, que salgan los avisos que haya en cola (05 §9, FR-164).
  useEffect(() => {
    void pedirEnvioComoJefatura();
  }, []);
  const pestanas: Pestana[] = [
    { ruta: 'cola', nombre: T.panelCola.colaRevision, badge: pendientes.datos, naranja: true },
    { ruta: 'inventario', nombre: T.panelCola.inventario, badge: puntos.length },
    { ruta: 'registro', nombre: T.panelCola.registro },
    { ruta: 'papelera', nombre: T.panelCola.papelera, badge: enPapelera.datos },
    { ruta: 'ajustes', nombre: T.panelCola.ajustes },
  ];
  return (
    <div className="bg-fondo flex min-h-dvh flex-col">
      <Cabecera correo={correo} />
      <AvisoServidor desde={pendientes.en} />
      {/* Por debajo de 1.024 px, las pestañas en dos filas: ninguna fuera de la vista ni desplazamiento a lo ancho (docs/20 RV-79). */}
      <nav
        aria-label={T.jefatura.panel}
        className="border-linea bg-fondo flex flex-wrap border-b px-2 lg:flex-nowrap lg:overflow-x-auto"
      >
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
              <Route path="cola" element={<ColaRevision alCambiar={recargarContadores} />} />
              <Route path="inventario" element={<Inventario />} />
              <Route path="registro" element={<Registro />} />
              <Route path="papelera" element={<Papelera alCambiar={recargarContadores} />} />
              <Route path="ajustes" element={<Ajustes />} />
              {/* Pestañas retiradas (DEC-167): quien las tenga guardadas llega al Inventario. */}
              <Route path="caducadas" element={<Navigate to="/admin/inventario" replace />} />
              <Route path="voluntarios" element={<Navigate to="/admin/inventario" replace />} />
              <Route path="*" element={<Navigate to="cola" replace />} />
            </Routes>
          </Suspense>
        </LimiteError>
      </main>
      <footer className="border-linea text-texto-suave border-t px-4 py-2 text-xs">{T.panel.atribucion}</footer>
    </div>
  );
}

/** Al salir se borra lo que se recuerda de los avisos de este administrador (docs/32 RV-264). */
function salir() {
  olvidarTemasJefatura();
  void salirDeGoogle();
}

/**
 * Por debajo de 800 px de ancho útil (tableta, o zoom 200 %), todo en una línea: el escudo, el buscador
 * dentro de la barra y "Ir al mapa" y "Cerrar sesión" en un menú ☰ (docs/33 RV-331, U14).
 */
function Cabecera({ correo }: { correo: string }) {
  const { busqueda, buscar } = usePanel();
  return (
    <header className="bg-barra flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-white max-[799px]:flex-nowrap max-[799px]:gap-x-2 max-[799px]:py-1.5 max-[799px]:pr-1 max-[799px]:pl-3">
      <div className="flex shrink-0 items-center gap-2">
        <Escudo className="size-8" />
        <h1 className="font-titulo text-[17px] font-semibold max-[799px]:sr-only">{T.panel.titulo}</h1>
      </div>
      <label className="relative order-last w-full max-[799px]:order-none max-[799px]:w-auto max-[799px]:min-w-0 max-[799px]:flex-1 md:order-none md:w-auto md:max-w-md md:flex-1">
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
      <div className="ml-auto flex items-center gap-1 text-sm max-[799px]:hidden">
        <span className="hidden text-[#B7C2D6] lg:inline">{correo}</span>
        <Link to="/" className="flex min-h-11 items-center gap-1 rounded px-2 hover:bg-white/10">
          <IconoMapa size={16} aria-hidden />
          {T.jefatura.irAlMapa}
        </Link>
        <button
          type="button"
          onClick={salir}
          className="flex min-h-11 items-center gap-1 rounded px-2 hover:bg-white/10"
        >
          <LogOut size={16} aria-hidden />
          {T.panel.salir}
        </button>
      </div>
      <MenuPequeno correo={correo} />
    </header>
  );
}

/** El menú ☰ de la cabecera por debajo de 800 px: se cierra con Escape, fuera o al elegir (RV-331). */
function MenuPequeno({ correo }: { correo: string }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const primero = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!abierto) return;
    primero.current?.focus();
    const fuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setAbierto(false);
      boton.current?.focus();
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  return (
    <div ref={caja} className="relative shrink-0 min-[800px]:hidden">
      <button
        ref={boton}
        type="button"
        aria-label={T.panel.menu}
        aria-expanded={abierto}
        aria-controls="menu-cabecera"
        onClick={() => setAbierto((a) => !a)}
        className="grid size-11 place-items-center rounded hover:bg-white/10"
      >
        <IconoMenu size={22} aria-hidden />
      </button>
      {abierto && (
        <div
          id="menu-cabecera"
          className="bg-barra rounded-campo absolute top-full right-0 z-50 mt-1 grid w-64 max-w-[calc(100vw-1rem)] border border-white/15 p-1 text-sm shadow-lg"
        >
          <span className="truncate px-3 py-2 text-[#B7C2D6]">{correo}</span>
          <Link
            ref={primero}
            to="/"
            onClick={() => setAbierto(false)}
            className="flex min-h-11 items-center gap-2 rounded px-3 hover:bg-white/10"
          >
            <IconoMapa size={16} aria-hidden />
            {T.jefatura.irAlMapa}
          </Link>
          <button
            type="button"
            onClick={salir}
            className="flex min-h-11 items-center gap-2 rounded px-3 text-left hover:bg-white/10"
          >
            <LogOut size={16} aria-hidden />
            {T.panel.salir}
          </button>
        </div>
      )}
    </div>
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
