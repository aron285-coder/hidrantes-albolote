import { type ClipboardEvent, type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { BarraSuperior } from '@/componentes/BarraSuperior';
import { Boton } from '@/componentes/Boton';
import { Escudo } from '@/componentes/Escudo';
import { SIN_SERVIDOR } from '@/lib/api';
import { entrarConCodigo, entrarConGoogle } from '@/lib/acceso';
import { VERSION } from '@/lib/entorno';
import { bloqueadoHasta, leerFirma } from '@/lib/sesion';
import { T } from '@/lib/textos';

const CIFRAS = 6;

/** Error de 05 §8 → texto para el voluntario, sin pistas sobre el código (FR-33, TR-36). */
function mensaje(codigo: string): string {
  switch (codigo) {
    case 'CODIGO_INCORRECTO':
      return T.entrada.codigoIncorrecto;
    case 'DEMASIADOS_INTENTOS':
      return T.entrada.demasiadosIntentos;
    case 'PAYLOAD_INVALIDO':
      return T.entrada.codigoSeisCifras;
    case SIN_SERVIDOR:
    default:
      return T.entrada.sinServidor;
  }
}

/** Pantalla de entrada (FL-01, 07 §7.1). El código no se guarda nunca en el móvil (TR-43). */
export function Entrada({ caducado }: { caducado: boolean }) {
  const firma = leerFirma();
  const [cifras, setCifras] = useState<string[]>(() => Array(CIFRAS).fill(''));
  const [nombre, setNombre] = useState(firma?.nombre ?? '');
  const [apellido, setApellido] = useState(firma?.apellido ?? '');
  const [errorCodigo, setErrorCodigo] = useState<string | null>(null);
  const [errorNombre, setErrorNombre] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [bloqueado, setBloqueado] = useState(() => bloqueadoHasta() !== null);
  const casillas = useRef<(HTMLInputElement | null)[]>([]);

  // El bloqueo dura una hora: pasada, la pantalla se desbloquea sola.
  useEffect(() => {
    if (!bloqueado) return;
    const hasta = bloqueadoHasta();
    const t = setTimeout(() => setBloqueado(false), hasta ? hasta - Date.now() : 0);
    return () => clearTimeout(t);
  }, [bloqueado]);

  function poner(desde: number, texto: string) {
    const digitos = texto.replace(/\D/g, '');
    if (!digitos && texto) return;
    const nuevas = [...cifras];
    if (!digitos) nuevas[desde] = '';
    for (let i = 0; i < digitos.length && desde + i < CIFRAS; i++) nuevas[desde + i] = digitos[i];
    setCifras(nuevas);
    setErrorCodigo(null);
    if (digitos) casillas.current[Math.min(CIFRAS - 1, desde + digitos.length)]?.focus();
  }

  function tecla(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !cifras[i] && i > 0) casillas.current[i - 1]?.focus();
  }

  function pegar(i: number, e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    poner(i, e.clipboardData.getData('text'));
  }

  async function entrar(e: FormEvent) {
    e.preventDefault();
    if (bloqueado || enviando) return;
    const codigo = cifras.join('');
    const faltaCodigo = codigo.length !== CIFRAS;
    const faltaNombre = !nombre.trim() || !apellido.trim();
    setErrorCodigo(faltaCodigo ? T.entrada.codigoSeisCifras : null);
    setErrorNombre(faltaNombre ? T.entrada.faltaNombre : null);
    if (faltaCodigo || faltaNombre) return;

    setEnviando(true);
    const error = await entrarConCodigo(codigo, { nombre, apellido });
    setEnviando(false);
    if (!error) return;
    setErrorCodigo(mensaje(error));
    if (error === 'DEMASIADOS_INTENTOS') setBloqueado(true);
    if (error === 'CODIGO_INCORRECTO') {
      setCifras(Array(CIFRAS).fill(''));
      casillas.current[0]?.focus();
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <BarraSuperior titulo={T.app.nombre} centrado />
      <form
        onSubmit={entrar}
        noValidate
        className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-2 px-3 py-6 text-center"
      >
        <Escudo className="mx-auto mb-3 h-[52px] w-[46px]" />
        {caducado && (
          <p role="alert" className="bg-oro-100 border-oro-600 text-ambar-700 mb-2 rounded-tarjeta border p-2 text-sm">
            {T.entrada.accesoCaducado}
          </p>
        )}
        <fieldset disabled={bloqueado}>
          <legend className="text-texto-suave mb-1.5 w-full text-center text-[13px] font-semibold">
            {T.entrada.codigo}
          </legend>
          <div className="flex justify-center gap-2">
            {cifras.map((c, i) => (
              <input
                key={i}
                ref={(el) => {
                  casillas.current[i] = el;
                }}
                value={c}
                onChange={(e) => poner(i, e.target.value.slice(-1))}
                onKeyDown={(e) => tecla(i, e)}
                onPaste={(e) => pegar(i, e)}
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={2}
                aria-label={T.entrada.cifra(i + 1)}
                aria-invalid={errorCodigo ? true : undefined}
                className="bg-papel border-linea rounded-campo font-datos size-11 border text-center text-xl disabled:opacity-60"
              />
            ))}
          </div>
        </fieldset>
        {errorCodigo && (
          <p role="alert" className="text-rojo-700 text-sm font-semibold">
            {errorCodigo}
          </p>
        )}

        <input
          value={nombre}
          onChange={(e) => {
            setNombre(e.target.value);
            setErrorNombre(null);
          }}
          placeholder={T.entrada.nombre}
          aria-label={T.entrada.nombre}
          autoComplete="given-name"
          maxLength={60}
          className="bg-papel border-linea rounded-campo mt-2 min-h-11 border px-3"
        />
        <input
          value={apellido}
          onChange={(e) => {
            setApellido(e.target.value);
            setErrorNombre(null);
          }}
          placeholder={T.entrada.apellido}
          aria-label={T.entrada.apellido}
          autoComplete="family-name"
          maxLength={60}
          className="bg-papel border-linea rounded-campo min-h-11 border px-3"
        />
        {errorNombre && (
          <p role="alert" className="text-rojo-700 text-sm font-semibold">
            {errorNombre}
          </p>
        )}

        <Boton type="submit" disabled={bloqueado || enviando} className="mt-1.5">
          {enviando ? T.entrada.entrando : T.entrada.entrar}
        </Boton>
        {bloqueado && !errorCodigo && <p className="text-texto-suave text-[13px]">{T.entrada.demasiadosIntentos}</p>}
        <p className="text-texto-suave text-[13px]">{T.entrada.soloUnaVez}</p>

        <Boton variante="enlace" className="mt-3 text-sm" onClick={() => void entrarConGoogle()}>
          {T.entrada.jefaturaGoogle}
        </Boton>
        <Link
          to="/legal"
          className="text-texto-suave mt-auto inline-flex min-h-11 items-center justify-center pt-4 text-xs underline"
        >
          {T.entrada.avisoLegalVersion(VERSION)}
        </Link>
      </form>
    </div>
  );
}
