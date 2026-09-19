import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fuentes servidas desde el propio despliegue, solo latín y los pesos de 06 §3.
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/source-sans-3/latin-400.css';
import '@fontsource/source-sans-3/latin-500.css';
import '@fontsource/source-sans-3/latin-600.css';
import '@fontsource/source-sans-3/latin-700.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import './index.css';
import { App } from './App';
import { iniciarAcceso } from './lib/acceso';
import { iniciarMapabase } from './lib/mapabase';
import { activarSiHayPermiso } from './lib/posicion';
import { registrarComprobacion } from './lib/conexion';
import { enviarErrores, instalarCapturaGlobal } from './lib/errores';
import { registrarServiceWorker } from './lib/pwa';
import { aplicarTema } from './lib/tema';

aplicarTema();
instalarCapturaGlobal();
registrarComprobacion(enviarErrores);
iniciarAcceso();
void iniciarMapabase();
void activarSiHayPermiso();
registrarServiceWorker();

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
