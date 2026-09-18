-- Solo Supabase local: el bucket de fotos con los mismos límites que crea arranque.ts en dev y
-- prod (04 §7), para que pgTAP compruebe que anon no puede escribir. Idempotente.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hidrantes-fotos-dev', 'hidrantes-fotos-dev', true, 5242880, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;
