import {
  CloudOff,
  ListChecks,
  LogOut,
  type LucideIcon,
  Map as IconoMapa,
  Menu as IconoMenu,
  ScrollText,
  Search,
  Settings,
  Table,
  Trash2,
  X,
} from 'lucide-react';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router';
import { Escudo } from '@/componentes/Escudo';
import { LimiteError } from '@/componentes/LimiteError';
import { ProveedorPanel } from '@/componentes/panel/contexto';
import { usePanel } from '@/componentes/panel/usar-panel';
import { PANEL_TABLETA, usePanelMovil } from '@/hooks/ancho';
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
  icono: LucideIcon;
  badge?: number | null;
  naranja?: boolean;
}

/** Ruta /admin (FR-100): panel de jefatura, para ordenador y usable en tableta y en el móvil (DEC-213). Cinco pestañas (DEC-167). */
export function PanelJefatura({ correo }: { correo: string }) {
  return (
    <ProveedorPanel>
      <Armazon correo={correo} />
    </ProveedorPanel>
  );
}

function Armazon({ correo }: { correo: string }) {
  const { puntos } = usePuntos();
  const movil = usePanelMovil();
  const ruta = useLocation().pathname.split('/')[2] ?? 'cola';
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
    { ruta: 'cola', nombre: T.panelCola.colaRevision, icono: ListChecks, badge: pendientes.datos, naranja: true },
    { ruta: 'inventario', nombre: T.panelCola.inventario, icono: Table, badge: puntos.length },
    { ruta: 'registro', nombre: T.panelCola.registro, icono: ScrollText },
    { ruta: 'papelera', nombre: T.panelCola.papelera, icono: Trash2, badge: enPapelera.datos },
    { ruta: 'ajustes', nombre: T.panelCola.ajustes, icono: Settings },
  ];
  const actual = pestanas.find((p) => p.ruta === ruta) ?? pestanas[0]!;
  // Desde otra pestaña, con propuestas pendientes, un punto naranja en ☰ (UI-18).
  const avisoPendientes = movil && ruta !== 'cola' && (pendientes.datos ?? 0) > 0;
  return (
    <div className="bg-fondo flex min-h-dvh flex-col">
      <Cabecera
        correo={correo}
        movil={movil}
        pestana={actual.nombre}
        pestanas={movil ? pestanas : null}
        avisoPendientes={avisoPendientes}
      />
      <AvisoServidor desde={pendientes.en} />
      {/* Desde 768 px, las cinco pestañas arriba en una fila, sin desplazamiento a lo ancho (UI-17, UI-18); por
          debajo, en el menú ☰ (DEC-213). */}
      {!movil && (
        <nav aria-label={T.jefatura.panel} className="border-linea bg-fondo flex border-b px-2">
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
              <Contador pestana={p} />
            </NavLink>
          ))}
        </nav>
      )}
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

/** El número de una pestaña: naranja para las pendientes, gris para los totales (06 §5). */
function Contador({ pestana: p }: { pestana: Pestana }) {
  if (p.badge == null) return null;
  return (
    <span
      className={cn(
        'rounded-full px-1.5 text-[11px] font-bold',
        p.naranja && p.badge > 0 ? 'bg-naranja-600 text-white' : 'bg-tinte-gris text-tinte-gris-texto',
      )}
    >
      {p.badge}
    </span>
  );
}

/** Al salir se borra lo que se recuerda de los avisos de este administrador (docs/32 RV-264). */
function salir() {
  olvidarTemasJefatura();
  void salirDeGoogle();
}

/**
 * Por debajo de 800 px de ancho útil (tableta, o zoom 200 %), todo en una línea: el escudo, el buscador
 * dentro de la barra y "Ir al mapa" y "Cerrar sesión" en un menú ☰ (docs/33 RV-331, U14). Por debajo de
 * 768 (DEC-213, UI-18): el `h1` dice la pestaña, la búsqueda es una lupa y ☰ lleva también las pestañas.
 */
function Cabecera({
  correo,
  movil,
  pestana,
  pestanas,
  avisoPendientes,
}: {
  correo: string;
  movil: boolean;
  pestana: string;
  pestanas: Pestana[] | null;
  avisoPendientes: boolean;
}) {
  const { busqueda, buscar } = usePanel();
  const [lupaAbierta, setLupaAbierta] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const lupa = useRef<HTMLButtonElement>(null);
  // Con algo escrito, el buscador se queda abierto: siempre se ve qué se está buscando.
  const buscando = !movil || lupaAbierta || busqueda !== '';

  const abrirLupa = () => {
    setLupaAbierta(true);
    requestAnimationFrame(() => campo.current?.focus());
  };
  const cerrarLupa = () => {
    buscar('');
    setLupaAbierta(false);
    requestAnimationFrame(() => lupa.current?.focus());
  };

  return (
    <header className="bg-barra flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-white max-[800px]:flex-nowrap max-[800px]:gap-x-2 max-[800px]:py-1.5 max-[800px]:pr-1 max-[800px]:pl-3">
      <div className="flex min-w-0 shrink-0 items-center gap-2 max-md:shrink">
        <Escudo className="size-8 shrink-0" />
        {/* En el móvil el h1 dice la pestaña; con el buscador abierto sigue en la página (para el lector), porque
            Hoja y Dialogo devuelven a él el foco cuando lo que los abrió ya no está. */}
        <h1
          className={cn(
            'font-titulo text-[17px] font-semibold',
            movil ? (buscando ? 'sr-only' : 'min-w-0') : 'max-[800px]:sr-only',
          )}
        >
          {movil ? (
            <>
              <span className="sr-only">{`${T.jefatura.panel} · `}</span>
              {pestana}
            </>
          ) : (
            T.panel.titulo
          )}
        </h1>
      </div>
      {buscando ? (
        <label className="relative order-last w-full max-[800px]:order-none max-[800px]:w-auto max-[800px]:min-w-0 max-[800px]:flex-1 md:order-none md:w-auto md:max-w-md md:flex-1">
          <span className="sr-only">{T.panelCola.buscar}</span>
          <Search size={16} aria-hidden className="absolute top-1/2 left-3 -translate-y-1/2 text-[#B7C2D6]" />
          <input
            ref={campo}
            type="search"
            value={busqueda}
            onChange={(e) => buscar(e.target.value)}
            // Mientras tiene el foco, se queda abierto aunque se borre lo escrito (llegó abierto por el texto).
            onFocus={() => setLupaAbierta(true)}
            placeholder={T.panelCola.buscar}
            className="rounded-campo min-h-10 w-full bg-white/10 pr-3 pl-9 text-sm text-white placeholder:text-[#B7C2D6]"
          />
        </label>
      ) : (
        <button
          ref={lupa}
          type="button"
          aria-label={T.panel.buscar}
          onClick={abrirLupa}
          className="ml-auto grid size-11 shrink-0 place-items-center rounded hover:bg-white/10"
        >
          <Search size={20} aria-hidden />
        </button>
      )}
      {movil && buscando && (
        <button
          type="button"
          aria-label={T.panel.cerrarBusqueda}
          onClick={cerrarLupa}
          className="grid size-11 shrink-0 place-items-center rounded hover:bg-white/10"
        >
          <X size={20} aria-hidden />
        </button>
      )}
      <div className="ml-auto flex items-center gap-1 text-sm max-[800px]:hidden">
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
      <MenuPequeno correo={correo} pestanas={pestanas} avisoPendientes={avisoPendientes} />
    </header>
  );
}

/**
 * El menú ☰ de la cabecera por debajo de 800 px: se cierra con Escape, fuera, al salir con el tabulador, al
 * elegir y al cruzar 768 u 800 px (RV-331). Por debajo de 768 lleva también las pestañas (UI-18, DEC-213).
 */
function MenuPequeno({
  correo,
  pestanas,
  avisoPendientes,
}: {
  correo: string;
  pestanas: Pestana[] | null;
  avisoPendientes: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const primero = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!abierto) return;
    // Con las pestañas, el foco va a la activa; si no, a «Ir al mapa».
    const activa = caja.current?.querySelector<HTMLAnchorElement>('nav a[aria-current="page"]');
    (activa ?? primero.current)?.focus();
    const fuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setAbierto(false);
      boton.current?.focus();
    };
    // Si la ventana cruza 768 o 800 px, el menú cambia o desaparece: no se queda abierto escondido.
    const cortes = [window.matchMedia('(min-width: 800px)'), window.matchMedia(`(min-width: ${PANEL_TABLETA}px)`)];
    const alCruzar = () => setAbierto(false);
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    cortes.forEach((m) => m.addEventListener('change', alCruzar));
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
      cortes.forEach((m) => m.removeEventListener('change', alCruzar));
    };
  }, [abierto]);

  return (
    <div
      ref={caja}
      className="relative shrink-0 min-[800px]:hidden"
      // Al salir con el tabulador, se cierra: no se queda tapando lo que hay detrás.
      onBlur={(e) => {
        if (!caja.current?.contains(e.relatedTarget as Node | null)) setAbierto(false);
      }}
    >
      <button
        ref={boton}
        type="button"
        aria-label={avisoPendientes ? T.panel.menuPendientes : T.panel.menu}
        aria-expanded={abierto}
        aria-controls={abierto ? 'menu-cabecera' : undefined}
        onClick={() => setAbierto((a) => !a)}
        className="relative grid size-11 place-items-center rounded hover:bg-white/10"
      >
        <IconoMenu size={22} aria-hidden />
        {avisoPendientes && (
          <span
            aria-hidden
            data-testid="aviso-pendientes"
            className="bg-naranja-600 ring-barra absolute top-2 right-2 size-2.5 rounded-full ring-2"
          />
        )}
      </button>
      {abierto && (
        <div
          id="menu-cabecera"
          className="bg-barra rounded-campo absolute top-full right-0 z-50 mt-1 grid w-64 max-w-[calc(100vw-1rem)] border border-white/15 p-1 text-sm shadow-lg"
        >
          <span className="px-3 py-2 break-all text-[#B7C2D6]">{correo}</span>
          {pestanas && (
            <nav aria-label={T.jefatura.panel} className="grid border-b border-white/15 pb-1">
              {pestanas.map((p) => (
                <NavLink
                  key={p.ruta}
                  to={`/admin/${p.ruta}`}
                  // El enlace desaparece al cerrar: el foco vuelve a ☰, no se pierde en <body>.
                  onClick={() => {
                    setAbierto(false);
                    boton.current?.focus();
                  }}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-11 items-center gap-2 rounded px-3 hover:bg-white/10',
                      isActive && 'bg-white/15 font-bold',
                    )
                  }
                >
                  <p.icono size={16} aria-hidden />
                  <span className="flex-1">{p.nombre}</span>
                  <Contador pestana={p} />
                </NavLink>
              ))}
            </nav>
          )}
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
            onClick={() => {
              setAbierto(false);
              salir();
            }}
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
