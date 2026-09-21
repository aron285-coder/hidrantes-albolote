import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AvisoVersion } from '@/componentes/AvisoVersion';
import { BandaEntorno } from '@/componentes/BandaEntorno';
import { LimiteError } from '@/componentes/LimiteError';
import { useAcceso } from '@/hooks/estado';
import { esPruebas } from '@/lib/entorno';
import { T } from '@/lib/textos';
import { Ajustes } from '@/paginas/Ajustes';
import { Armazon } from '@/paginas/Armazon';
import { Bienvenida } from '@/paginas/Bienvenida';
import { Entrada } from '@/paginas/Entrada';
import { Incidencia } from '@/paginas/Incidencia';
import { Legal } from '@/paginas/Legal';
import { MisPropuestas } from '@/paginas/MisPropuestas';
import { Proponer } from '@/paginas/Proponer';
import { Lista } from '@/paginas/Lista';
import { Mapa } from '@/paginas/Mapa';
import { NoAutorizado } from '@/paginas/NoAutorizado';

// El panel solo lo abre jefatura: fuera del JavaScript inicial (TR-11).
const PanelJefatura = lazy(() => import('@/paginas/PanelJefatura').then((m) => ({ default: m.PanelJefatura })));

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
  return (
    <Routes>
      <Route
        path="/bienvenida"
        element={
          <LimiteError>
            <Bienvenida />
          </LimiteError>
        }
      />
      <Route path="/legal" element={<Legal />} />
      <Route path="/proponer/:operacion" element={<Proponer />} />
      <Route
        path="/mis-propuestas"
        element={acceso.tipo === 'voluntario' ? <MisPropuestas /> : <Navigate to="/" replace />}
      />
      <Route path="/incidencia" element={acceso.tipo === 'voluntario' ? <Incidencia /> : <Navigate to="/" replace />} />
      <Route
        path="/admin/*"
        element={
          acceso.tipo === 'jefatura' ? (
            <Suspense fallback={<p className="text-texto-suave m-auto p-6">{T.panelCola.cargando}</p>}>
              <PanelJefatura correo={acceso.correo} />
            </Suspense>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route element={<Armazon />}>
        <Route index element={<Mapa />} />
        <Route path="lista" element={<Lista />} />
        <Route path="ajustes" element={<Ajustes />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
