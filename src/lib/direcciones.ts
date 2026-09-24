// Números de portal para la búsqueda (FR-73, docs/18 GM-04 C y D): `POST /api/geocodificar`, con el
// token del voluntario o la sesión de jefatura. Necesita cobertura; sin ella, o con el servicio
// caído, la búsqueda enseña la calle del callejero y lo dice (TR-118).

export interface Direccion {
  etiqueta: string;
  tipo: 'portal' | 'calle' | 'lugar';
  lat: number;
  lng: number;
  municipio: 'albolote' | 'calicasas' | null;
}

/** `sin_acceso`: la Function dijo 401, el token ya no vale (docs/19 RV-63). */
export type Direcciones = { ok: true; resultados: Direccion[] } | { ok: false; sinAcceso?: true };

/** La Function responde en 5 s como mucho; esto cubre además la red. */
const LIMITE_MS = 8000;

/** Token del voluntario o JWT de jefatura: nunca anónima (DEC-092). */
export type Credencial = { token: string } | { jwt: string };

/**
 * Pregunta por las direcciones; `senal` la cancela cuando llega otra tecla. Sin importar nada de la
 * app: va en su propio trozo, que se carga al preguntar (TR-11).
 */
export async function buscarDirecciones(q: string, c: Credencial, senal: AbortSignal): Promise<Direcciones> {
  // Sin AbortSignal.any: los iPhone con iOS 16 no lo tienen.
  const control = new AbortController();
  const cancelar = () => control.abort();
  senal.addEventListener('abort', cancelar);
  const reloj = setTimeout(cancelar, LIMITE_MS);
  try {
    const r = await fetch('/api/geocodificar', {
      method: 'POST',
      signal: control.signal,
      headers: { 'Content-Type': 'application/json', ...('jwt' in c ? { Authorization: `Bearer ${c.jwt}` } : {}) },
      body: JSON.stringify({ q, ...('token' in c ? { token: c.token } : {}) }),
    });
    if (r.status === 401) return { ok: false, sinAcceso: true };
    if (!r.ok) return { ok: false };
    const cuerpo = (await r.json()) as { resultados?: Direccion[] };
    return Array.isArray(cuerpo.resultados) ? { ok: true, resultados: cuerpo.resultados } : { ok: false };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(reloj);
    senal.removeEventListener('abort', cancelar);
  }
}
