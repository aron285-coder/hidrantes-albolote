import { BandaEntorno } from '@/componentes/BandaEntorno';
import { esPruebas } from '@/lib/entorno';
import { T } from '@/lib/textos';

// Armazón de la Fase 0: solo cabecera y banda de entorno. Acceso y navegación llegan en la Fase 4.
export function App() {
  return (
    <div className="bg-fondo text-texto min-h-dvh">
      {esPruebas && <BandaEntorno />}
      <header className="bg-marino-950 text-papel px-3 py-2.5">
        <h1 className="font-titulo text-base font-semibold tracking-wide">{T.app.nombre}</h1>
      </header>
    </div>
  );
}
