import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { LimiteError } from '@/componentes/LimiteError';
import type { Acceso } from '@/lib/acceso';
import { iniciarMapabase } from '@/lib/mapabase';
import { T } from '@/lib/textos';
import { Ajustes } from '@/paginas/Ajustes';
import { Armazon } from '@/paginas/Armazon';
import { Bienvenida } from '@/paginas/Bienvenida';
import { Incidencia } from '@/paginas/Incidencia';
import { Legal } from '@/paginas/Legal';
import { Lista } from '@/paginas/Lista';
import { Mapa } from '@/paginas/Mapa';
import { MisPropuestas } from '@/paginas/MisPropuestas';
import { Proponer } from '@/paginas/Proponer';

// El panel solo lo abre jefatura: fuera del JavaScript inicial (TR-11).
const PanelJefatura = lazy(() => import('@/paginas/PanelJefatura').then((m) => ({ default: m.PanelJefatura })));

/**
 * Las pantallas con sesión: el mapa (Leaflet y el mapa base), la lista, Ajustes y las operaciones.
 * App.tsx las carga aparte y de una vez, para que la pantalla de entrada no las descargue (TR-103).
 * Van todas juntas a propósito: una vez dentro, ninguna pantalla depende de otra descarga, y sin
 * cobertura se puede ir a cualquiera (el Service Worker las precachea con el resto del JS).
 */
export default function RutasDentro({ acceso }: { acceso: Extract<Acceso, { tipo: 'voluntario' | 'jefatura' }> }) {
  // El mapa base (FR-81) se comprueba y, si falta y hay wifi, se descarga al entrar, con la primera
  // pantalla ya pintada: sin sesión no hay mapa que enseñar, y sus 4 MB no compiten con la pantalla
  // de entrada (TR-103). Llamarlo dos veces no descarga dos veces.
  useEffect(() => {
    void iniciarMapabase();
  }, []);

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
