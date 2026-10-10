import { Link } from 'react-router';
import { hayNovedadesSinVer } from '@/lib/novedades';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

/**
 * En el ordenador (desde 1100 px), la navegación va arriba, junto al título, y sin «Lista», que ya está a
 * la izquierda del mapa (docs/33 RV-321, U12). Con «Mis propuestas», que en el móvil se abre desde Ajustes.
 */
const ARRIBA = [
  { a: '/', texto: T.navegacion.mapa },
  { a: '/mis-propuestas', texto: T.navegacion.misPropuestas },
  { a: '/ajustes', texto: T.navegacion.ajustes },
] as const;

/**
 * La navegación de arriba del ordenador, en la barra superior. La pintan el armazón (Mapa, Lista, Ajustes)
 * y Mis propuestas, que va fuera del armazón (#625). Por debajo de 1100 px no se ve: allí está la de abajo.
 */
export function NavegacionArriba({ pathname, jefatura }: { pathname: string; jefatura: boolean }) {
  // Mis propuestas es del voluntario (jefatura tiene la Cola del panel).
  const destinos = ARRIBA.filter(({ a }) => !jefatura || a !== '/mis-propuestas');
  const ruta = pathname.replace(/\/+$/, '') || '/';
  return (
    <nav aria-label={T.app.nombreCorto} className="mr-auto ml-6 hidden items-center gap-1 min-[1100px]:flex">
      {destinos.map(({ a, texto }) => {
        // La lista es parte del mapa en el ordenador: en /lista, «Mapa» también es la página activa.
        const activa = ruta === a || (a === '/' && ruta === '/lista');
        // docs/34 RV-353: el punto es solo de vista; el nombre dice «Ajustes, hay novedades».
        const novedades = a === '/ajustes' && ruta !== '/ajustes' && hayNovedadesSinVer();
        return (
          <Link
            key={a}
            to={a}
            aria-label={novedades ? `${texto}${T.navegacion.hayNovedades}` : undefined}
            aria-current={activa ? 'page' : undefined}
            className={cn(
              'relative flex min-h-11 items-center border-b-2 px-3 text-[15px] font-semibold text-white',
              activa ? 'border-naranja-600' : 'border-transparent',
            )}
          >
            {texto}
            {novedades && (
              <span
                data-testid="punto-novedades-arriba"
                className="bg-naranja-600 absolute top-2 right-1 size-2 rounded-full"
                aria-hidden
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
