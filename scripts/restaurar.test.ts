// La restauración borra el esquema entero antes de recrearlo: lo que se comprueba aquí es que no
// se pueda disparar contra el proyecto equivocado ni con un archivo que no sea nuestro (15 §5.3).

import { describe, expect, it } from 'vitest';
import {
  LIMPIAR_ESQUEMA,
  REFS,
  pareceVolcado,
  refDeUrl,
  sinCrearEsquema,
  sqlRestauracion,
  tocaPublic,
} from './restaurar.ts';
import { archivosDe, sinCarpetaRaiz } from './restaurar-fotos.ts';

const POOLER =
  'postgresql://hidrantes_migrador.cbgqirjqyltadpydpeyr:clave@aws-0-eu-west-3.pooler.supabase.com:5432/postgres'; // detectar-secretos:permitir (cadena de ejemplo, sin valores reales)

describe('a qué proyecto apunta una cadena', () => {
  it('lo saca del usuario del pooler', () => {
    expect(refDeUrl(POOLER)).toBe(REFS.prod);
  });

  it('y del host de la conexión directa', () => {
    expect(refDeUrl('postgresql://postgres:x@db.jowapbzawsebfpksnlqx.supabase.co:5432/postgres')).toBe(REFS.staging);
  });

  it('el Supabase local no tiene ref: por eso --entorno local no comprueba nada', () => {
    expect(refDeUrl('postgresql://hidrantes_migrador:x@127.0.0.1:55422/postgres')).toBeNull();
  });

  it('staging y producción no se parecen, que es lo que salva de restaurar sobre el otro', () => {
    expect(REFS.staging).not.toBe(REFS.prod);
  });
});

describe('qué archivo se acepta', () => {
  it('un volcado del esquema hidrantes', () => {
    expect(pareceVolcado('CREATE SCHEMA hidrantes;')).toBe(true);
    expect(pareceVolcado('create table hidrantes.puntos (id uuid);')).toBe(true);
  });

  it('cualquier otra cosa, no', () => {
    expect(pareceVolcado('hola')).toBe(false);
    expect(pareceVolcado('')).toBe(false);
  });

  it('nada que toque public: ahí vive la app de uniformidad', () => {
    expect(tocaPublic('CREATE SCHEMA hidrantes;\nCREATE TABLE public.usuarios (id int);')).toBe(true);
    expect(tocaPublic('DROP SCHEMA public CASCADE;')).toBe(true);
    expect(tocaPublic('CREATE SCHEMA hidrantes;\nCREATE TABLE hidrantes.puntos (id uuid);')).toBe(false);
  });

  it('mencionar public de pasada no es tocarlo (search_path, comentarios)', () => {
    expect(tocaPublic('SET search_path = pg_catalog, public;\nCREATE TABLE hidrantes.x (i int);')).toBe(false);
  });
});

describe('el guion de restauración', () => {
  const volcado = ['CREATE SCHEMA hidrantes;', 'CREATE TABLE hidrantes.puntos (id uuid);', ''].join('\n');
  const sql = sqlRestauracion(volcado, 'hidrantes-2026-09-20.sql', 'restauracion prod');

  it('va entero en una transacción: si falla a la mitad, la base se queda como estaba', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
  });

  // hidrantes_migrador no puede crear esquemas (DEC-052) y en una emergencia no hay más cadena que
  // la del secreto: por eso se vacía el esquema en vez de borrarlo y recrearlo.
  it('vacía el esquema hidrantes sin borrarlo, y no toca public', () => {
    expect(sql).toContain(LIMPIAR_ESQUEMA.trim().split('\n')[0]);
    expect(sql).toContain("where schemaname = 'hidrantes'");
    expect(sql).not.toMatch(/drop schema/i);
    expect(sql).not.toMatch(/public/i);
  });

  it('el CREATE SCHEMA del volcado se quita: el esquema ya está y cambiarlo daría permiso denegado', () => {
    expect(sinCrearEsquema('CREATE SCHEMA hidrantes;')).not.toMatch(/^CREATE SCHEMA/m);
    expect(sinCrearEsquema('ALTER SCHEMA hidrantes OWNER TO postgres;')).not.toMatch(/^ALTER SCHEMA/m);
    expect(sinCrearEsquema('CREATE TABLE hidrantes.puntos (id uuid);')).toContain('CREATE TABLE hidrantes.puntos');
  });

  it('el contenido del volcado llega entero', () => {
    expect(sql).toContain('CREATE TABLE hidrantes.puntos (id uuid);');
  });

  it('deja constancia en el registro, con el archivo del que salió', () => {
    expect(sql).toContain("'restauracion_respaldo'");
    expect(sql).toContain("'hidrantes-2026-09-20.sql'");
  });
});

describe('fotos restauradas', () => {
  it('el tar lleva la carpeta del respaldo dentro: en el bucket no va', () => {
    expect(sinCarpetaRaiz('fotos-2026-09-20/fotos/a.jpg')).toBe('fotos/a.jpg');
    expect(sinCarpetaRaiz('fotos-2026-09-20/suelta.jpg')).toBe('suelta.jpg');
  });

  it('recorre las carpetas del respaldo desempaquetado, con barras de URL', () => {
    const archivos = archivosDe('scripts');
    expect(archivos).toContain('lib/claves.ts');
    // En Windows readdir daría barras invertidas: en el bucket la ruta lleva las normales.
    expect(archivos.some((f) => f.includes(String.fromCharCode(92)))).toBe(false);
  });
});
