-- El registro es de solo añadir (05 §2.3). La anonimización puede reescribir `actor`, y solo con
-- el texto exacto que pone fn_anonimizar_autor (docs/17 RV-26, 11 §7).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(2);

insert into hidrantes.registro (actor, es_admin, accion) values ('Ana Pérez', false, 'propuesta_creada');
select set_config('test.id', (select max(id)::text from hidrantes.registro), true);
select set_config('hidrantes.anonimizando', 'on', true);

select throws_like(
  format($$ update hidrantes.registro set actor = 'otra persona' where id = %s $$, current_setting('test.id')),
  'REGISTRO_INMUTABLE%', 'con anonimizando=on, cambiar actor a otro texto falla con REGISTRO_INMUTABLE');
select lives_ok(
  format($$ update hidrantes.registro set actor = 'voluntario dado de baja' where id = %s $$, current_setting('test.id')),
  'y al texto de la anonimización, sí');

select * from finish();
rollback;
