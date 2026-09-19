import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AvisoVersion } from '@/componentes/AvisoVersion';
import { BandaEntorno } from '@/componentes/BandaEntorno';
import { LimiteError } from '@/componentes/LimiteError';
import { useAcceso } from '@/hooks/estado';
import { esPruebas } from '@/lib/entorno';
import { T } from '@/lib/textos';
import { Ajustes } from '@/paginas/Ajustes';
import { Armazon, PantallaVacia } from '@/paginas/Armazon';
import { Bienvenida } from '@/paginas/Bienvenida';
import { Entrada } from '@/paginas/Entrada';
import { Legal } from '@/paginas/Legal';
import { NoAutorizado } from '@/paginas/NoAutorizado';
import { PanelJefatura } from '@/paginas/PanelJefatura';

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
      <Route
        path="/admin"
        element={acceso.tipo === 'jefatura' ? <PanelJefatura correo={acceso.correo} /> : <Navigate to="/" replace />}
      />
      <Route element={<Armazon />}>
        <Route index element={<PantallaVacia texto={T.mapa.mapaProximamente} />} />
        <Route path="lista" element={<PantallaVacia texto={T.mapa.listaProximamente} />} />
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
