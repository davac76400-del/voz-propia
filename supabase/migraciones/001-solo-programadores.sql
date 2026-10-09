-- Solo las cuentas de programador pueden leer y escribir las tablas de trabajo (videos y carpetas) y publicar palabras.
-- Todos los dispositivos siguen leyendo shared_phrases: es lo que la app descarga para funcionar.
--
-- Para dar acceso a otra cuenta (el id sale de auth.users):
--   insert into public.programadores (user_id) values ('<id>');

create table if not exists public.programadores (
  user_id uuid primary key references auth.users (id) on delete cascade,
  creado timestamptz not null default now()
);
alter table public.programadores enable row level security;
comment on table public.programadores is 'Sin policies a propósito: solo se consulta con soy_programador().';

create or replace function public.soy_programador() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.programadores where user_id = (select auth.uid())) $$;
revoke all on function public.soy_programador() from public, anon;
grant execute on function public.soy_programador() to authenticated;

-- Fuera las reglas abiertas a cualquiera.
drop policy if exists "folders delete" on public.programmer_folders;
drop policy if exists "folders insert" on public.programmer_folders;
drop policy if exists "folders read" on public.programmer_folders;
drop policy if exists "videos delete" on public.programmer_videos;
drop policy if exists "All can insert" on public.programmer_videos;
drop policy if exists "All can read" on public.programmer_videos;
drop policy if exists "videos update" on public.programmer_videos;
drop policy if exists "shared delete" on public.shared_phrases;
drop policy if exists "shared insert" on public.shared_phrases;
drop policy if exists "shared update" on public.shared_phrases;

create policy "programadores administran" on public.programmer_folders
  for all to authenticated using ((select public.soy_programador())) with check ((select public.soy_programador()));
create policy "programadores administran" on public.programmer_videos
  for all to authenticated using ((select public.soy_programador())) with check ((select public.soy_programador()));
create policy "programadores publican" on public.shared_phrases
  for all to authenticated using ((select public.soy_programador())) with check ((select public.soy_programador()));
-- La política «shared read» (lectura para todos) se queda como estaba.
