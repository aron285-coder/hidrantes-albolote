-- Solo para `supabase start` en local: PostgREST exige que el esquema expuesto exista al arrancar.
-- El resto (rol, extensiones, permisos) lo hace `npm run migrar -- --local` con arranque-bd.sql.
create schema if not exists hidrantes;
