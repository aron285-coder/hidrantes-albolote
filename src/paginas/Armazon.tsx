import { useEffect } from 'react';
import { List, Map as IconoMapa, Settings } from 'lucide-react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router';
import { BarraSuperior } from '@/componentes/BarraSuperior';
import { EstadoSincro } from '@/componentes/mapa/BarraEstado';
import { NavegacionArriba } from '@/componentes/NavegacionArriba';
import { AvisoNovedades } from '@/componentes/AvisoNovedades';
import { hayNovedadesSinVer } from '@/lib/novedades';
import { LimiteError } from '@/componentes/LimiteError';
import { useAcceso } from '@/hooks/estado';
import { primerUsoVisto } from '@/lib/sesion';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

const DESTINOS = [
  { a: '/', texto: T.navegacion.mapa, Icono: IconoMapa },
  { a: '/lista', texto: T.navegacion.lista, Icono: List },
  { a: '/ajustes', texto: T.navegacion.ajustes, Icono: Settings },
] as const;

const TITULOS: Record<string, string> = {
  '/': T.navegacion.puntosDeAgua,
  '/lista': T.navegacion.puntosDeAgua,
  '/ajustes': T.navegacion.ajustes,
};

/** Armazón de la app: barra superior, pantalla y navegación inferior Mapa · Lista · Ajustes (06 §5). */
export function Armazon() {
  const acceso = useAcceso();
  const { pathname } = useLocation();
  // Lo que ocupa la navegación de abajo: el aviso de versión nueva va justo encima (docs/33 RV-313).
  useEffect(() => {
    const raiz = document.documentElement;
    // En el ordenador (desde 1100 px) no hay barra abajo: la medida la da index.css (docs/33 RV-321).
    raiz.style.setProperty('--nav-abajo', 'var(--alto-nav-abajo)');
    return () => {
      raiz.style.removeProperty('--nav-abajo');
    };
  }, []);
  if (acceso.tipo === 'voluntario' && !primerUsoVisto()) return <Navigate to="/bienvenida" replace />;

  // El mapa y la lista miden la pantalla y solo se desplaza la lista (#562): con `basis-0` el armazón no
  // empuja el alto de la página y ocupa lo que queda bajo la banda. Solo con 600 px de alto o más (el mismo
  // corte que el mínimo del mapa en Mapa.tsx): en una ventana más baja, con los avisos de arriba, la lista
  // se quedaría sin sitio, así que la página crece y se desplaza como antes. Ajustes siempre crece.
  const ruta = pathname.replace(/\/+$/, '') || '/'; // «/lista/» también es la lista
  const aPantalla = ruta === '/' || ruta === '/lista';

  return (
    <div
      className={cn(
        'flex flex-1 flex-col',
        aPantalla && '[@media(min-height:600px)]:min-h-0 [@media(min-height:600px)]:basis-0',
      )}
    >
      <BarraSuperior
        titulo={TITULOS[pathname] ?? T.app.nombre}
        jefatura={acceso.tipo === 'jefatura'}
        // En el mapa y la lista, el estado de la sincronización en la propia barra (docs/33 RV-311).
        estado={aPantalla ? <EstadoSincro /> : undefined}
        navegacion={<NavegacionArriba pathname={pathname} jefatura={acceso.tipo === 'jefatura'} />}
      />
      <AvisoNovedades />
      <main className="flex min-h-0 flex-1 flex-col pb-[calc(50px+env(safe-area-inset-bottom))] min-[1100px]:pb-0">
        <LimiteError>
          <Outlet />
        </LimiteError>
      </main>
      <nav
        aria-label={T.app.nombreCorto}
        // En el ordenador va arriba, en la barra (docs/33 RV-321).
        className="bg-papel border-linea fixed inset-x-0 bottom-0 z-20 flex border-t pb-[env(safe-area-inset-bottom)] min-[1100px]:hidden"
      >
        {DESTINOS.map(({ a, texto, Icono }) => (
          <NavLink
            key={a}
            to={a}
            end
            // docs/34 RV-353: el punto es solo de vista; el nombre dice «Ajustes, hay novedades».
            aria-label={
              a === '/ajustes' && pathname !== '/ajustes' && hayNovedadesSinVer()
                ? `${texto}${T.navegacion.hayNovedades}`
                : undefined
            }
            className={({ isActive }) =>
              cn(
                'flex h-[50px] flex-1 flex-col items-center justify-center text-[12px]',
                isActive ? 'text-texto font-bold' : 'text-texto-suave',
              )
            }
          >
            <span className="relative">
              <Icono size={20} strokeWidth={1.75} aria-hidden />
              {/* Novedades de la versión sin ver: un punto hasta abrir Ajustes (RV-20, FR-167). */}
              {a === '/ajustes' && pathname !== '/ajustes' && hayNovedadesSinVer() && (
                <span
                  className="bg-naranja-600 absolute -top-0.5 -right-1 size-2.5 rounded-full"
                  data-testid="punto-novedades"
                  aria-hidden
                />
              )}
            </span>
            {texto}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
