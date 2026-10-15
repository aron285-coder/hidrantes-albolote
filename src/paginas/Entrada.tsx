import { type ClipboardEvent, type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { BarraSuperior } from '@/componentes/BarraSuperior';
import { Boton } from '@/componentes/Boton';
import { Escudo } from '@/componentes/Escudo';
import { entrarConCodigo, entrarConGoogle } from '@/lib/acceso';
import { CIFRAS_CODIGO, escribirEnCasilla, repartir, type Reparto } from '@/lib/casillas-codigo';
import { VERSION } from '@/lib/entorno';
import { bloqueadoHasta, leerFirma } from '@/lib/sesion';
import { LIMITES } from '@/lib/limites';
import { mensajeEntrada } from '@/lib/mensajes-entrada';
import { REINTENTOS_OCUPADO, esperaOcupado } from '@/lib/reintento-entrada';
import { T } from '@/lib/textos';

const CIFRAS = CIFRAS_CODIGO;

/**
 * Lo que el navegador dice que se ha insertado (RV-470). Mientras el teclado compone, `data` es la
 * composición entera y no lo nuevo: entonces no se usa y manda el valor de la casilla.
 */
function insertado(evento: Event): string | null {
  if (typeof InputEvent === 'undefined' || !(evento instanceof InputEvent)) return null;
  return evento.inputType === 'insertCompositionText' ? null : evento.data;
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
  // docs/37 RV-491: tras OCUPADO, la espera hasta el reintento solo (segundos que quedan y cuál es).
  const [reintento, setReintento] = useState<{ quedan: number; numero: number } | null>(null);
  const casillas = useRef<(HTMLInputElement | null)[]>([]);
  const campoNombre = useRef<HTMLInputElement>(null);
  const campoApellido = useRef<HTMLInputElement>(null);
  const botonEntrar = useRef<HTMLButtonElement>(null);

  // La cuenta atrás del reintento solo; a cero, se intenta otra vez con lo que haya escrito ahora.
  const intentarRef = useRef<(reintentos: number) => Promise<void>>(async () => {});
  useEffect(() => {
    if (!reintento) return;
    const t = setTimeout(() => {
      if (reintento.quedan > 1) {
        setReintento({ ...reintento, quedan: reintento.quedan - 1 });
        return;
      }
      setReintento(null);
      void intentarRef.current(reintento.numero);
    }, 1000);
    return () => clearTimeout(t);
  }, [reintento]);

  // El bloqueo dura una hora: pasada, la pantalla se desbloquea sola.
  useEffect(() => {
    if (!bloqueado) return;
    const hasta = bloqueadoHasta();
    const t = setTimeout(() => setBloqueado(false), hasta ? hasta - Date.now() : 0);
    return () => clearTimeout(t);
  }, [bloqueado]);

  function aplicar(reparto: Reparto | null) {
    if (!reparto) return;
    // Cambiar el código cancela la espera del reintento solo.
    setReintento(null);
    setCifras(reparto.cifras);
    setErrorCodigo(null);
    if (reparto.foco === 'completo') {
      // Con el código entero (RV-470), lo siguiente que falta: el nombre, el apellido o entrar.
      const siguiente = !nombre.trim()
        ? campoNombre.current
        : !apellido.trim()
          ? campoApellido.current
          : botonEntrar.current;
      siguiente?.focus();
    } else if (reparto.foco !== null) casillas.current[reparto.foco]?.focus();
  }

  function tecla(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !cifras[i] && i > 0) casillas.current[i - 1]?.focus();
  }

  function pegar(i: number, e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    aplicar(repartir(cifras, i, e.clipboardData.getData('text')));
  }

  async function entrar(e: FormEvent) {
    e.preventDefault();
    if (bloqueado || enviando || reintento) return;
    const codigo = cifras.join('');
    const faltaCodigo = codigo.length !== CIFRAS;
    const faltaNombre = !nombre.trim() || !apellido.trim();
    setErrorCodigo(faltaCodigo ? T.entrada.codigoSeisCifras : null);
    setErrorNombre(faltaNombre ? T.entrada.faltaNombre : null);
    if (faltaCodigo || faltaNombre) return;
    setReintento(null);
    await intentar(0);
  }

  /** Canjea el código. `reintentos`: cuántos reintentos solos van ya tras OCUPADO (0: a mano). */
  async function intentar(reintentos: number) {
    setEnviando(true);
    const error = await entrarConCodigo(cifras.join(''), { nombre, apellido });
    setEnviando(false);
    if (!error) return;
    // docs/37 RV-491: mucha gente entrando; se espera lo que dice el servidor más un poco al azar y se
    // intenta solo, como mucho REINTENTOS_OCUPADO veces seguidas. Después, el texto de siempre.
    if (error.codigo === 'OCUPADO' && reintentos < REINTENTOS_OCUPADO) {
      setErrorCodigo(null);
      setReintento({ quedan: esperaOcupado(error.reintentarEnS), numero: reintentos + 1 });
      return;
    }
    setErrorCodigo(mensajeEntrada(error.codigo, bloqueadoHasta()));
    if (error.codigo === 'DEMASIADOS_INTENTOS') setBloqueado(true);
    if (error.codigo === 'CODIGO_INCORRECTO') {
      setCifras(Array(CIFRAS).fill(''));
      casillas.current[0]?.focus();
    }
  }

  intentarRef.current = intentar;

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
          <p
            role="alert"
            className="bg-tinte-oro border-oro-600 text-tinte-oro-texto mb-2 rounded-tarjeta border p-2 text-sm"
          >
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
                onChange={(e) => aplicar(escribirEnCasilla(cifras, i, e.target.value, insertado(e.nativeEvent)))}
                onKeyDown={(e) => tecla(i, e)}
                onPaste={(e) => pegar(i, e)}
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                // Cabe un código entero con separadores y la cifra que ya hubiera: se reparte, no se corta (RV-470).
                maxLength={CIFRAS * 3}
                aria-label={T.entrada.cifra(i + 1)}
                aria-invalid={errorCodigo ? true : undefined}
                className="bg-papel border-linea rounded-campo font-datos size-11 border text-center text-xl disabled:opacity-60"
              />
            ))}
          </div>
        </fieldset>
        {errorCodigo && (
          <p role="alert" className="text-rojo-texto text-sm font-semibold">
            {errorCodigo}
          </p>
        )}

        <input
          ref={campoNombre}
          value={nombre}
          onChange={(e) => {
            setNombre(e.target.value);
            setErrorNombre(null);
            setReintento(null);
          }}
          placeholder={T.entrada.nombre}
          aria-label={T.entrada.nombre}
          autoComplete="given-name"
          maxLength={LIMITES.autor_nombre}
          className="bg-papel border-linea rounded-campo mt-2 min-h-11 border px-3"
        />
        <input
          ref={campoApellido}
          value={apellido}
          onChange={(e) => {
            setApellido(e.target.value);
            setErrorNombre(null);
            setReintento(null);
          }}
          placeholder={T.entrada.apellido}
          aria-label={T.entrada.apellido}
          autoComplete="family-name"
          maxLength={LIMITES.autor_apellido}
          className="bg-papel border-linea rounded-campo min-h-11 border px-3"
        />
        {errorNombre && (
          <p role="alert" className="text-rojo-texto text-sm font-semibold">
            {errorNombre}
          </p>
        )}

        {/* Mientras espera el reintento solo, Entrar no se pulsa: el motivo es la cuenta atrás (UI-02). */}
        <Boton
          ref={botonEntrar}
          type="submit"
          disabled={bloqueado || enviando || reintento !== null}
          className="mt-1.5"
        >
          {enviando ? T.entrada.entrando : T.entrada.entrar}
        </Boton>
        {/* El aviso para lectores de pantalla, siempre en la página y una sola vez por espera: la cuenta
            atrás de abajo cambia cada segundo y no se anuncia (UI-03). */}
        <p role="status" className="sr-only">
          {reintento ? T.entrada.ocupadoReintentoAnuncio : ''}
        </p>
        {reintento && (
          <div className="flex flex-col items-center gap-1">
            <p aria-hidden className="text-texto text-sm font-semibold text-balance">
              {T.entrada.ocupadoReintento(reintento.quedan)}
            </p>
            <Boton variante="secundario" onClick={() => setReintento(null)}>
              {T.entrada.cancelarReintento}
            </Boton>
          </div>
        )}
        {bloqueado && !errorCodigo && (
          <p className="text-texto-suave text-[13px]">{mensajeEntrada('DEMASIADOS_INTENTOS', bloqueadoHasta())}</p>
        )}
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
