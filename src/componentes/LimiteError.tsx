import { TriangleAlert } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Boton } from './Boton';
import { leer } from '@/lib/almacen';
import { ENTORNO } from '@/lib/entorno';
import { anotarError } from '@/lib/errores';
import { T } from '@/lib/textos';

interface Props {
  ruta: string;
  alVolver: () => void;
  children: ReactNode;
}

class Limite extends Component<Props, { fallo: boolean }> {
  state = { fallo: false };

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const e = error instanceof Error ? error : new Error(String(error));
    if (info.componentStack) e.stack = `${e.stack ?? e.message}\n${info.componentStack}`;
    anotarError(e, this.props.ruta);
  }

  render() {
    if (!this.state.fallo) return this.props.children;
    return (
      <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <TriangleAlert size={32} className="text-ambar-700" aria-hidden />
        <h2 className="font-titulo text-lg font-bold">{T.fallo.titulo}</h2>
        <p className="text-texto-suave text-sm">{T.fallo.detalle}</p>
        <Boton className="mt-2 w-full max-w-xs" onClick={this.props.alVolver}>
          {T.envio.volverAlMapa}
        </Boton>
      </div>
    );
  }
}

/**
 * Fallo provocado para las pruebas (TR-106): fuera de producción, si `hidrantes.forzar_fallo`
 * contiene la ruta actual, la pantalla lanza un error al dibujarse. No es un control visible.
 */
function FalloProvocado({ ruta }: { ruta: string }) {
  if (ENTORNO !== 'produccion' && leer<string>('forzar_fallo') === ruta) {
    throw new Error(`Fallo provocado en ${ruta}`);
  }
  return null;
}

/** Límite de error por pantalla (TR-106): mensaje, "Volver al mapa" y registro en errores_cliente. */
export function LimiteError({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navegar = useNavigate();
  return (
    <Limite key={pathname} ruta={pathname} alVolver={() => navegar('/', { replace: true })}>
      <FalloProvocado ruta={pathname} />
      {children}
    </Limite>
  );
}

/**
 * Límite para todas las pantallas con sesión juntas (App.tsx). No se reinicia al cambiar de ruta,
 * para no volver a montar el armazón y el mapa en cada navegación. Si lo que falla es la descarga de
 * su JavaScript, "Volver al mapa" recarga la aplicación entera, que es lo que la vuelve a pedir (TR-106).
 */
export function LimiteCarga({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <Limite ruta={pathname} alVolver={() => location.assign('/')}>
      {children}
    </Limite>
  );
}
