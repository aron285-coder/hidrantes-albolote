-- 0021 · La época de los datos existe desde el principio (docs/18 RV-34).
--
-- 0012 solo la leía: ninguna migración la sembraba y todos los móviles guardaban null. Tras la
-- primera restauración veían el paso de null a un valor, y la regla "la primera época no fuerza
-- nada" (src/lib/puntos.ts) evitaba justo la sincronización completa que la restauración necesita.
-- Con un valor desde ya, los móviles lo guardan en su próxima sincronización y la primera
-- restauración sí les llega.
insert into hidrantes.config (clave, valor, actualizado_por)
values ('epoca_datos', to_jsonb(gen_random_uuid()::text), 'migracion')
on conflict (clave) do nothing;
