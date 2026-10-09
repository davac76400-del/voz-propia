-- 004 · Memoria de los videos del programador.
-- Cada video que se sube, cambia o borra queda copiado en `memoria_videos` (y cada palabra publicada,
-- en `memoria_palabras`). La memoria solo se puede leer: ni la app ni una migración por error pueden
-- borrarla, vaciarla ni cambiar los puntos de labios que guardó.
-- Se puede pegar completa cuantas veces haga falta: no borra nada.

create table if not exists public.memoria_videos (
  memoria_id     bigint generated always as identity primary key,
  video_id       bigint not null unique,
  text           text not null,
  text_inicial   text not null,
  start_time     double precision,
  end_time       double precision,
  lip_points     jsonb,
  created_at     timestamptz,
  imported_by    text,
  folder         text not null default 'Sin carpeta',
  folder_inicial text not null default 'Sin carpeta',
  source_name    text,
  frame_count    integer not null default 0,
  orig_text      text,
  copiado_en     timestamptz not null default now(),
  borrado_en     timestamptz,
  recuperado_en  timestamptz
);

create table if not exists public.memoria_palabras (
  memoria_id   bigint generated always as identity primary key,
  text_key     text not null,
  text         text not null,
  folder       text,
  samples      jsonb,
  version_de   timestamptz,
  archivado_en timestamptz not null default now(),
  motivo       text not null check (motivo in ('inicial', 'cambio', 'borrada'))
);

alter table public.memoria_videos enable row level security;
alter table public.memoria_palabras enable row level security;
revoke all on public.memoria_videos, public.memoria_palabras from anon, authenticated;
grant select on public.memoria_videos, public.memoria_palabras to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'memoria_videos' and policyname = 'programadores leen la memoria') then
    create policy "programadores leen la memoria" on public.memoria_videos
      for select to authenticated using ((select public.soy_programador()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'memoria_palabras' and policyname = 'programadores leen la memoria de palabras') then
    create policy "programadores leen la memoria de palabras" on public.memoria_palabras
      for select to authenticated using ((select public.soy_programador()));
  end if;
end $$;

-- Copia cada alta, cambio y baja de un video a la memoria. Los puntos de labios y el texto original no se pisan.
create or replace function public.memoria_videos_copiar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.programmer_videos;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  insert into public.memoria_videos (video_id, text, text_inicial, start_time, end_time, lip_points, created_at, imported_by, folder, folder_inicial, source_name, frame_count, orig_text, borrado_en)
  values (r.id, r.text, r.text, r.start_time, r.end_time, r.lip_points, r.created_at, r.imported_by, r.folder, r.folder, r.source_name, r.frame_count, r.orig_text, case when tg_op = 'DELETE' then now() end)
  on conflict (video_id) do update set
    text = excluded.text,
    folder = excluded.folder,
    source_name = excluded.source_name,
    orig_text = excluded.orig_text,
    borrado_en = case when tg_op = 'DELETE' then now() else null end,
    recuperado_en = case when tg_op = 'INSERT' then now() else public.memoria_videos.recuperado_en end;
  return r;
end $$;

create or replace trigger memoria_alta after insert on public.programmer_videos
  for each row execute function public.memoria_videos_copiar();
create or replace trigger memoria_cambio after update on public.programmer_videos
  for each row execute function public.memoria_videos_copiar();
create or replace trigger memoria_baja before delete on public.programmer_videos
  for each row execute function public.memoria_videos_copiar();

-- La memoria no se borra, no se vacía y no cambia lo que guardó.
create or replace function public.memoria_proteger()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'La memoria de videos no se puede borrar.' using errcode = '42501';
  end if;
  if new.lip_points is distinct from old.lip_points or new.video_id <> old.video_id
     or new.created_at is distinct from old.created_at or new.text_inicial <> old.text_inicial or new.folder_inicial <> old.folder_inicial then
    raise exception 'Lo guardado en la memoria no se puede cambiar.' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace trigger memoria_no_borrar before delete on public.memoria_videos
  for each row execute function public.memoria_proteger();
create or replace trigger memoria_no_cambiar before update on public.memoria_videos
  for each row execute function public.memoria_proteger();
create or replace trigger memoria_no_vaciar before truncate on public.memoria_videos
  for each statement execute function public.memoria_proteger();

-- Cada versión de una palabra publicada queda guardada antes de cambiarla o quitarla.
create or replace function public.memoria_palabras_copiar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.samples is not distinct from old.samples and new.text is not distinct from old.text and new.folder is not distinct from old.folder then
    return new;
  end if;
  insert into public.memoria_palabras (text_key, text, folder, samples, version_de, motivo)
  values (old.text_key, old.text, old.folder, old.samples, old.updated_at, case when tg_op = 'DELETE' then 'borrada' else 'cambio' end);
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace trigger memoria_palabras_cambio before update or delete on public.shared_phrases
  for each row execute function public.memoria_palabras_copiar();

create or replace function public.memoria_inmutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'La memoria no se puede cambiar ni borrar.' using errcode = '42501';
end $$;

create or replace trigger inmutable_cambio before update or delete on public.memoria_palabras
  for each row execute function public.memoria_inmutable();
create or replace trigger inmutable_vaciar before truncate on public.memoria_palabras
  for each statement execute function public.memoria_inmutable();

-- Nadie vacía de golpe las tablas de videos, carpetas ni palabras (TRUNCATE).
create or replace function public.no_vaciar()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Esta tabla no se puede vaciar de golpe.' using errcode = '42501';
end $$;

create or replace trigger no_vaciar before truncate on public.programmer_videos
  for each statement execute function public.no_vaciar();
create or replace trigger no_vaciar before truncate on public.programmer_folders
  for each statement execute function public.no_vaciar();
create or replace trigger no_vaciar before truncate on public.shared_phrases
  for each statement execute function public.no_vaciar();

-- Lo que ya existe entra a la memoria (si ya estaba, no se repite).
insert into public.memoria_videos (video_id, text, text_inicial, start_time, end_time, lip_points, created_at, imported_by, folder, folder_inicial, source_name, frame_count, orig_text)
select id, text, text, start_time, end_time, lip_points, created_at, imported_by, folder, folder, source_name, frame_count, orig_text
from public.programmer_videos
on conflict (video_id) do nothing;

insert into public.memoria_palabras (text_key, text, folder, samples, version_de, motivo)
select p.text_key, p.text, p.folder, p.samples, p.updated_at, 'inicial'
from public.shared_phrases p
where not exists (select 1 from public.memoria_palabras m where m.text_key = p.text_key);

-- Las funciones de los disparadores solo las usa la base: nadie las llama por la API (los disparadores siguen funcionando).
revoke execute on function public.memoria_videos_copiar() from public, anon, authenticated;
revoke execute on function public.memoria_palabras_copiar() from public, anon, authenticated;
revoke execute on function public.memoria_proteger() from public, anon, authenticated;
revoke execute on function public.memoria_inmutable() from public, anon, authenticated;
revoke execute on function public.no_vaciar() from public, anon, authenticated;
