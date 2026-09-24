import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { AvisoVersion } from '@/componentes/AvisoVersion';
import { BandaEntorno } from '@/componentes/BandaEntorno';
import { LimiteCarga } from '@/componentes/LimiteError';
import { useAcceso } from '@/hooks/estado';
import { acceso as accesoAlArrancar } from '@/lib/acceso';
import { esPruebas } from '@/lib/entorno';
import { T } from '@/lib/textos';
import { Entrada } from '@/paginas/Entrada';
import { Legal } from '@/paginas/Legal';
import { NoAutorizado } from '@/paginas/NoAutorizado';

// Las pantallas con sesión (mapa, Leaflet, operaciones) van en una porción aparte: la pantalla de
// entrada no la descarga (TR-103, TR-11). Con una sesión guardada se pide ya al arrancar, en
// paralelo con el primer dibujo, sin esperar a que React llegue a pedirla.
//
// Sin `lazy` ni `Suspense` (docs/20 RV-80, DEC-112): React 19 deja el aviso de un `Suspense` a la vista
// al menos 300 ms antes de enseñar lo que esperaba, aunque la porción llegue al momento. Con la
// precarga, la porción llega casi a la vez que el JavaScript inicial, así que esos 300 ms eran el
// "Cargando…" que se veía al recargar con sesión. Ahora el aviso es un estado normal y el mapa sale
// en cuanto la porción está.
type ModuloDentro = typeof import('@/paginas/RutasDentro');
let moduloDentro: ModuloDentro | null = null;
let cargaDentro: Promise<ModuloDentro> | null = null;
const cargarDentro = () =>
  (cargaDentro ??= import('@/paginas/RutasDentro').then(
    (m) => (moduloDentro = m),
    (e: unknown) => {
      cargaDentro = null;
      throw e;
    },
  ));
if (accesoAlArrancar().tipo !== 'fuera') void cargarDentro().catch(() => undefined);

/** La porción con sesión: el aviso mientras llega; si no llega, el error sube a `LimiteCarga` (TR-106). */
function Dentro({ acceso }: { acceso: Parameters<ModuloDentro['default']>[0]['acceso'] }) {
  const [modulo, setModulo] = useState(moduloDentro);
  const [fallo, setFallo] = useState<{ error: unknown } | null>(null);
  useEffect(() => {
    if (!modulo) cargarDentro().then(setModulo, (error: unknown) => setFallo({ error }));
  }, [modulo]);
  if (fallo) throw fallo.error;
  if (!modulo) {
    return (
      <p role="status" className="text-texto-suave m-auto p-6">
        {T.app.cargando}
      </p>
    );
  }
  const RutasDentro = modulo.default;
  return <RutasDentro acceso={acceso} />;
}

function Rutas() {
  const acceso = useAcceso();

  if (acceso.tipo === 'comprobando') {
    return (
      <p role="status" className="text-texto-suave m-auto p-6">
        {T.entrada.comprobandoCuenta}
      </p>
    );
  }
  if (acceso.tipo === 'no_autorizado') return <NoAutorizado />;
  if (acceso.tipo === 'fuera') {
    return (
      <Routes>
        <Route path="/legal" element={<Legal />} />
        <Route path="*" element={<Entrada caducado={acceso.caducado} />} />
      </Routes>
    );
  }
  // Si la porción no llegara (sin red y sin Service Worker), mensaje y registro, nunca en blanco (TR-106).
  return (
    <LimiteCarga>
      <Dentro acceso={acceso} />
    </LimiteCarga>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <div className="bg-fondo text-texto flex min-h-dvh flex-col">
        {esPruebas && <BandaEntorno />}
        <Rutas />
        <AvisoVersion />
      </div>
    </BrowserRouter>
  );
}
