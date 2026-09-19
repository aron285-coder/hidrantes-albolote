import { type FormEvent, type ReactNode, useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Boton } from '@/componentes/Boton';
import { Hoja } from '@/componentes/Hoja';
import { useAcceso } from '@/hooks/estado';
import { useVersionNueva } from '@/hooks/version';
import { cambiarFirma, cerrarSesionVoluntario, salirDeGoogle } from '@/lib/acceso';
import { VERSION } from '@/lib/entorno';
import { recargar } from '@/lib/pwa';
import { type Tema, guardarTema, leerTema } from '@/lib/tema';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

function Fila({ titulo, detalle, children }: { titulo: ReactNode; detalle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="bg-papel border-linea rounded-tarjeta flex min-h-12 items-center gap-2 border px-3 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="text-[15px]">{titulo}</div>
        {detalle && <div className="text-texto-suave text-[13px]">{detalle}</div>}
      </div>
      {children}
    </div>
  );
}

const Seccion = ({ children }: { children: ReactNode }) => (
  <h2 className="font-titulo text-texto-suave mt-3 text-[13px] font-semibold tracking-wide uppercase">{children}</h2>
);

const OPCIONES_TEMA: [Tema, string][] = [
  ['sistema', T.ajustes.segunMovil],
  ['oscuro', T.ajustes.siempre],
  ['claro', T.ajustes.nunca],
];

/**
 * Ajustes (FR-93, FL-12). Solo lo que ya funciona: mapa sin cobertura, sincronización, capa,
 * Mis propuestas, avisos e incidencias aparecen con sus fases (UI-01, DEC-060).
 */
export function Ajustes() {
  const acceso = useAcceso();
  const navegar = useNavigate();
  const hayVersion = useVersionNueva();
  const [tema, setTema] = useState(leerTema);
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const cerrarHoja = useCallback(() => setConfirmar(false), []);

  const sesion = acceso.tipo === 'voluntario' ? acceso.sesion : null;
  const [nombre, setNombre] = useState(sesion?.nombre ?? '');
  const [apellido, setApellido] = useState(sesion?.apellido ?? '');
  const faltaNombre = !nombre.trim() || !apellido.trim();

  function guardarNombre(e: FormEvent) {
    e.preventDefault();
    if (faltaNombre) return;
    cambiarFirma({ nombre, apellido });
    setEditando(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-2 p-3">
      {acceso.tipo === 'jefatura' && (
        <Fila titulo={T.ajustes.cuentaJefatura} detalle={T.ajustes.sesionGoogle(acceso.correo)}>
          <Boton variante="enlace" className="text-sm" onClick={() => void salirDeGoogle()}>
            {T.ajustes.cerrarSesionGoogle}
          </Boton>
        </Fila>
      )}

      {sesion && !editando && (
        <Fila titulo={`${sesion.nombre} ${sesion.apellido}`} detalle={T.ajustes.firma}>
          <Boton variante="enlace" className="text-sm" onClick={() => setEditando(true)}>
            {T.ajustes.cambiar}
          </Boton>
        </Fila>
      )}
      {sesion && editando && (
        <form onSubmit={guardarNombre} className="bg-papel border-linea rounded-tarjeta flex flex-col gap-2 border p-3">
          <label className="text-texto-suave text-[13px] font-semibold">
            {T.entrada.nombre}
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={60}
              className="bg-papel border-linea rounded-campo text-texto mt-1 block min-h-11 w-full border px-3 text-base font-normal"
            />
          </label>
          <label className="text-texto-suave text-[13px] font-semibold">
            {T.entrada.apellido}
            <input
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              maxLength={60}
              className="bg-papel border-linea rounded-campo text-texto mt-1 block min-h-11 w-full border px-3 text-base font-normal"
            />
          </label>
          <div className="flex gap-3">
            <Boton type="submit" disabled={faltaNombre} className="flex-1">
              {T.ajustes.guardar}
            </Boton>
            <Boton variante="secundario" className="flex-1" onClick={() => setEditando(false)}>
              {T.ajustes.cancelar}
            </Boton>
          </div>
          {faltaNombre && <p className="text-texto-suave text-[13px]">{T.entrada.faltaNombre}</p>}
        </form>
      )}

      <Seccion>{T.ajustes.pantalla}</Seccion>
      <Fila titulo={T.ajustes.modoOscuro}>
        <div role="radiogroup" aria-label={T.ajustes.modoOscuro} className="border-linea flex rounded-campo border">
          {OPCIONES_TEMA.map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={tema === valor}
              onClick={() => {
                guardarTema(valor);
                setTema(valor);
              }}
              className={cn(
                'min-h-11 px-2 text-[13px] first:rounded-l-campo last:rounded-r-campo',
                tema === valor ? 'bg-texto text-fondo font-semibold' : 'text-texto-suave',
              )}
            >
              {texto}
            </button>
          ))}
        </div>
      </Fila>

      <Seccion>{T.ajustes.ayuda}</Seccion>
      <Fila titulo={T.ajustes.comoSeUsa}>
        <Boton variante="enlace" className="text-sm" onClick={() => navegar('/bienvenida')}>
          {T.ajustes.ver}
        </Boton>
      </Fila>
      <Fila titulo={T.entrada.avisoLegal}>
        <Link to="/legal" className="text-texto inline-flex min-h-11 items-center px-1 text-sm underline">
          {T.ajustes.ver}
        </Link>
      </Fila>

      {sesion && (
        <button
          type="button"
          onClick={() => setConfirmar(true)}
          className="bg-rojo-100 border-rojo-700 rounded-tarjeta text-rojo-700 mt-3 min-h-12 border px-3 text-left text-[15px] font-semibold"
        >
          {T.ajustes.cerrarSesion}
        </button>
      )}

      <p className="text-texto-suave mt-2 text-center text-[13px]">
        {T.ajustes.version(VERSION)}
        {hayVersion && (
          <>
            {' · '}
            <button type="button" onClick={recargar} className="text-texto min-h-11 font-semibold underline">
              {T.ajustes.versionNueva}
            </button>
          </>
        )}
      </p>

      {confirmar && (
        <Hoja titulo={T.ajustes.confirmarCerrar} alCerrar={cerrarHoja}>
          <p className="text-texto-suave mb-3 text-sm">{T.ajustes.cerrarSesionDetalle}</p>
          <Boton variante="destructivo" className="w-full" onClick={cerrarSesionVoluntario}>
            {T.ajustes.cerrarSesionBoton}
          </Boton>
          <Boton variante="secundario" className="mt-3 w-full" onClick={cerrarHoja}>
            {T.ajustes.cancelar}
          </Boton>
        </Hoja>
      )}
    </div>
  );
}
