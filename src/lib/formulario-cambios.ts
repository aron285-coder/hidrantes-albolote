// docs/32 RV-239: si un formulario de proponer está a medias. Salir sin enviar solo pregunta si hay
// algo que perder: algún campo distinto de como se abrió, o alguna foto.

const vacio = (v: unknown) => v === undefined || v === null || v === '';

/**
 * Si `actual` tiene algo distinto de `inicial`. Un campo escrito y luego borrado ('' frente a
 * undefined) no cuenta como cambio. Los valores compuestos (el pin) se comparan por su contenido.
 */
export function hayCambios(actual: object, inicial: object): boolean {
  const a = actual as Record<string, unknown>;
  const b = inicial as Record<string, unknown>;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (vacio(a[k]) && vacio(b[k])) continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return true;
  }
  return false;
}
