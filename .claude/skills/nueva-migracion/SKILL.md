---
name: nueva-migracion
description: Crear una migración SQL del esquema hidrantes sin romper staging ni producción. Úsala siempre que haya que cambiar una tabla, función, vista, permiso o tarea pg_cron.
---

# Nueva migración

1. Solo la sesión Backend crea migraciones (docs/trabajo-en-paralelo.md §3). Si no eres Backend,
   pídela en la issue de coordinación.
2. Actualiza `docs/05` **antes** que el SQL.
3. Nunca edites ni borres una migración existente. Nunca `supabase db push`. Los hooks de
   `.claude/settings.json` lo bloquean si está en `develop` (DEC-115); una migración que solo está
   en tu rama sí se puede editar y renumerar.
4. Para cambiar una función: `create or replace` con **la misma firma**, o `alter function … set/reset`.
   Firma nueva = función nueva, y la antigua se queda (compatibilidad con la versión anterior del
   frontend, 04 §12).
5. Toda tabla nueva lleva en la misma migración sus `grant` explícitos para `service_role` (y para
   `authenticated` o `anon` solo si 05 §5 lo dice) y su RLS. Toda función nueva, `revoke` de
   `public` y `grant` solo a quien la necesita. Escrituras con bloqueo por fila (05 §11).
6. pgTAP en `supabase/tests/NN_*.test.sql` (siguiente número libre): el comportamiento y los permisos.
7. `npm run migrar -- --local` dos veces (idempotencia), `npm run test:sql`, `npm run compatibilidad`.
   Si no hay Docker en local, empuja primero los tests y lanza `ci-sql` con
   `gh workflow run ci.yml --ref <rama>`.
8. **Justo antes de fusionar**, rebasa sobre `develop` y comprueba que tu número es el siguiente al
   último de `develop`. Si no, renómbralo. CI lo comprueba (`comprobar-migraciones-nuevas`).
