// Los límites del bucket de fotos (04 §7, TR-45), en un solo sitio. Hasta ahora estaban escritos dos
// veces —en `asegurarBucket` y en `supabase/sql/local-storage.sql`— sin nada que los uniera, y solo
// se ponían al arrancar: si alguien los cambiaba desde el panel de Supabase (el proyecto es el de la
// app de uniformidad), la protección desaparecía sin que nadie se enterara (`docs/41` RV-540).
//
// Ahora los pone el arranque y los revisa la vigilancia cada día, los dos leyendo de aquí.
//
// Sin dependencias a propósito: `scripts/revisar-bucket.ts` corre en la vigilancia con `node` a
// secas, sin `node_modules` (DEC-198).

export interface ConfigBucket {
  /** Lectura por URL no enumerable (04 §7): sin esto, las fichas no se verían sin conexión. */
  public: boolean;
  /** TR-45: 5 MB. Lo que el móvil sube son ~250 kB. */
  file_size_limit: number;
  /** TR-45: solo lo que recomprime el móvil. */
  allowed_mime_types: string[];
}

export const CONFIG_BUCKET_FOTOS: ConfigBucket = {
  public: true,
  file_size_limit: 5 * 1024 * 1024,
  allowed_mime_types: ['image/jpeg', 'image/webp'],
};

/**
 * En qué se diferencia lo que hay en el bucket de lo que tiene que haber. Una línea por campo, con
 * el nombre del campo y los dos valores: nunca una clave ni una URL (11 §6). Vacío = todo en su
 * sitio. Lo que no sea un objeto con esos tres campos cuenta como respuesta que no se entiende.
 */
export function diferenciasDelBucket(respuesta: unknown, esperado: ConfigBucket = CONFIG_BUCKET_FOTOS): string[] {
  if (!respuesta || typeof respuesta !== 'object' || Array.isArray(respuesta)) {
    return ['la respuesta del bucket de fotos no se entiende'];
  }
  const b = respuesta as Partial<ConfigBucket>;
  const diferencias: string[] = [];
  if (b.public !== esperado.public) {
    diferencias.push(`bucket de fotos: public distinto (${b.public === undefined ? 'sin dato' : String(b.public)})`);
  }
  if (b.file_size_limit !== esperado.file_size_limit) {
    const hay = b.file_size_limit === undefined || b.file_size_limit === null ? 'sin tope' : String(b.file_size_limit);
    diferencias.push(`bucket de fotos: file_size_limit distinto (${hay}, se esperaba ${esperado.file_size_limit})`);
  }
  const tipos = Array.isArray(b.allowed_mime_types) ? [...b.allowed_mime_types].map(String) : null;
  const esperados = [...esperado.allowed_mime_types];
  if (!tipos || tipos.length !== esperados.length || esperados.some((t, i) => tipos[i] !== t)) {
    diferencias.push(
      `bucket de fotos: allowed_mime_types distinto (${tipos ? tipos.join(', ') || 'ninguno' : 'sin dato'}, se esperaba ${esperados.join(', ')})`,
    );
  }
  return diferencias;
}
