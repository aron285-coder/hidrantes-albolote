import { describe, expect, it } from 'vitest';
import { archivoProhibido, buscarSecretos, esVolcado } from './detectar-secretos.ts';

describe('buscarSecretos', () => {
  it.each([
    ['-----BEGIN PGP PRIVATE KEY BLOCK-----'],
    ['const k = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdefghijklmnop"'],
    ['sb_secret_abcdefghijklmnopqrstu'],
    ['token: ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
    ['postgresql://hidrantes_migrador.abc:Sup3rClave@aws-0.pooler.supabase.com:5432/postgres'],
    ['SERVICE_ROLE_KEY=abcdefghijklmnop123'],
  ])('detecta %s', (linea) => {
    expect(buscarSecretos(linea)).toHaveLength(1);
  });

  it.each([
    ['postgresql://postgres:postgres@127.0.0.1:55422/postgres'],
    ['postgresql://hidrantes_migrador:migrador-local@127.0.0.1:55422/postgres'],
    ['postgresql://hidrantes_migrador.${ref}:${clave}@${host}:5432/postgres'],
    ['SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}'],
    ['VITE_SUPABASE_URL='],
    ['    SUPABASE_SERVICE_ROLE_KEY: sb.servicio,'],
    ['    PGPASSWORD: decodeURIComponent(u.password),'],
    ['// `postgresql://usuario:clave@host:puerto/bd`'],
    ['eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.abcdefghijklmnop  # detectar-secretos:permitir'],
  ])('no molesta con %s', (linea) => {
    expect(buscarSecretos(linea)).toHaveLength(0);
  });
});

describe('archivoProhibido', () => {
  it.each(['.env', '.env.local', 'config/.env.produccion', 'respaldo.sql.gpg', 'datos/mapa.pmtiles'])('%s', (r) =>
    expect(archivoProhibido(r)).toBe(true),
  );
  it.each(['.env.example', 'src/lib/entorno.ts', 'datos/zona-cobertura.geojson', 'public/mapabase/albolote.pmtiles'])(
    '%s se permite',
    (r) => expect(archivoProhibido(r)).toBe(false),
  );
});

// docs/18 RV-37: un volcado descifrado lleva en claro nombres, correos y el hash del código.
describe('volcado de la base de datos', () => {
  const volcado = ['--', '-- PostgreSQL database dump', '--', 'COPY hidrantes.puntos (id, codigo) FROM stdin;'].join(
    '\n',
  );

  it('un archivo con la cabecera de pg_dump se bloquea', () => {
    expect(esVolcado('hidrantes.sql', volcado)).toBe(true);
    expect(esVolcado('docs/notas.txt', 'x\nCOPY hidrantes.propuestas (id) FROM stdin;\n')).toBe(true);
  });

  it('las migraciones y los tests de supabase/ no', () => {
    expect(esVolcado('supabase/migrations/0099_x.sql', volcado)).toBe(false);
    expect(esVolcado('supabase/seed-staging.sql', volcado)).toBe(false);
  });

  it('citar la cabecera en un documento, sin empezar la línea con ella, no es un volcado', () => {
    expect(esVolcado('docs/18.md', 'bloquea `-- PostgreSQL database dump` o `COPY hidrantes.`')).toBe(false);
  });
});
