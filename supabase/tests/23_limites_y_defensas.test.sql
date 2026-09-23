-- docs/18 RV-48: límites y defensas pequeñas. Todo dentro de una transacción que se deshace.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(5);

insert into hidrantes.config (clave, valor, actualizado_por)
values ('codigo_acceso_hash', to_jsonb(extensions.crypt('482917', extensions.gen_salt('bf', 4))), 'test')
on conflict (clave) do update set valor = excluded.valor;
select set_config('test.token',
  (select token from hidrantes.fn_verificar_codigo('482917', 'dddddddd-0000-4000-8000-0000000e4801', 'ip-rv48')), true);
select set_config('request.jwt.claims', '', true);

-- ---------- 1. dias_reserva_subida = 1 ----------
update hidrantes.config set valor = '1' where clave = 'dias_reserva_subida';
insert into hidrantes.subidas (dispositivo_id, foto_path, reservada_en)
values ('dddddddd-0000-4000-8000-0000000e4801', 'fotos/rv48-una-hora.jpg', now() - interval '1 hour');
insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio, fecha_ultima_revision)
values ('00000000-0000-4000-8000-0000000e4811', 'HID-8481', 'hidrante', 'SRID=4326;POINT(-3.6591 37.2331)', 100,
        'bueno', 'fotos/r.jpg', 'albolote', current_date);
select lives_ok($$
  select hidrantes.fn_proponer(current_setting('test.token'), 'rv48-reserva-1', 'Ana', 'Ruiz', 'revision',
    '00000000-0000-4000-8000-0000000e4811', '{}', null, null, null, null, null, null, null, null,
    'fotos/rv48-una-hora.jpg') $$,
  'con dias_reserva_subida = 1, una reserva de hace una hora entra (sobre develop: FOTO_NO_RESERVADA)');
select ok('fotos/rv48-una-hora.jpg' in (select hidrantes.fn_fotos_referenciadas()),
  'y la purga protege al menos dos días de reservas');
insert into hidrantes.subidas (dispositivo_id, foto_path, reservada_en)
values ('dddddddd-0000-4000-8000-0000000e4801', 'fotos/rv48-hace-36h.jpg', now() - interval '36 hours');
select ok('fotos/rv48-hace-36h.jpg' in (select hidrantes.fn_fotos_referenciadas()),
  'también una de hace 36 h, sin confirmar');

-- ---------- 3. una inundación no hace crecer intentos_codigo ----------
insert into hidrantes.intentos_codigo (dispositivo_id, ip_hash, exito, momento)
select gen_random_uuid(), 'ip-inundacion', false, now() - interval '10 minutes' from generate_series(1, 30);
select count(*) from (
  select hidrantes.fn_verificar_codigo('000001', gen_random_uuid(), 'ip-inundacion') from generate_series(1, 100)
) x;
select cmp_ok((select count(*)::int from hidrantes.intentos_codigo
                where bloqueado and ip_hash = 'ip-inundacion' and momento > now() - interval '1 minute'),
  '<=', 1, '100 intentos bloqueados en un minuto dejan como mucho una fila por tope');

-- ---------- 4. fn_renombrar_nucleo con lock_timeout ----------
select ok((select proconfig from pg_proc where oid = 'hidrantes.fn_renombrar_nucleo(text, text)'::regprocedure)
          @> array['lock_timeout=5s'], 'fn_renombrar_nucleo espera un bloqueo como mucho 5 s');

select * from finish();
rollback;
