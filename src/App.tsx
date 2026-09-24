import { Suspense, lazy } from 'react';
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
const cargarDentro = () => import('@/paginas/RutasDentro');
const RutasDentro = lazy(cargarDentro);
if (accesoAlArrancar().tipo !== 'fuera') void cargarDentro();

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
      <Suspense
        fallback={
          <p role="status" className="text-texto-suave m-auto p-6">
            {T.app.cargando}
          </p>
        }
      >
        <RutasDentro acceso={acceso} />
      </Suspense>
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
