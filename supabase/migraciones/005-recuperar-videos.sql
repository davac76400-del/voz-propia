-- 005 · Recuperar videos y palabras desde la memoria (solo programadores).
-- Depende de 004-memoria-videos.sql. Se puede pegar completa cuantas veces haga falta: no borra nada.
--
--  · recuperar_videos(ids)   → devuelve a la lista, con su mismo número, los videos borrados que están en la
--                              memoria. Sin ids: recupera todos los borrados.
--  · recuperar_palabra(llave)→ vuelve a publicar la última versión guardada de una palabra.
--
-- Borrar un video sigue siendo un DELETE normal desde la app: el disparador `memoria_baja` (004) lo copia
-- a la memoria antes de quitarlo, así que nada se pierde.

create or replace function public.recuperar_videos(p_ids bigint[] default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not public.soy_programador() then
    raise exception 'Solo el programador puede recuperar videos.' using errcode = '42501';
  end if;
  with rec as (
    insert into public.programmer_videos (id, text, start_time, end_time, lip_points, created_at, imported_by, folder, source_name, frame_count, orig_text)
    overriding system value
    select m.video_id, m.text, m.start_time, m.end_time, m.lip_points, m.created_at, m.imported_by, m.folder, m.source_name, m.frame_count, m.orig_text
    from public.memoria_videos m
    where m.borrado_en is not null and (p_ids is null or m.video_id = any(p_ids))
    on conflict (id) do nothing
    returning id, folder
  ), carpetas as (
    insert into public.programmer_folders (name)
    select distinct folder from rec
    on conflict (name) do nothing
  )
  select count(*) into n from rec;
  return n;
end $$;

create or replace function public.recuperar_palabra(p_text_key text, p_memoria_id bigint default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v public.memoria_palabras;
begin
  if not public.soy_programador() then
    raise exception 'Solo el programador puede recuperar palabras.' using errcode = '42501';
  end if;
  select * into v from public.memoria_palabras
   where text_key = p_text_key and (p_memoria_id is null or memoria_id = p_memoria_id)
   order by memoria_id desc limit 1;
  if not found then return false; end if;
  insert into public.shared_phrases (text_key, text, samples, folder, updated_at)
  values (v.text_key, v.text, coalesce(v.samples, '[]'::jsonb), coalesce(v.folder, 'Sin carpeta'), now())
  on conflict (text_key) do update set text = excluded.text, samples = excluded.samples, folder = excluded.folder, updated_at = now();
  return true;
end $$;

revoke execute on function public.recuperar_videos(bigint[]) from public, anon;
revoke execute on function public.recuperar_palabra(text, bigint) from public, anon;
grant execute on function public.recuperar_videos(bigint[]) to authenticated;
grant execute on function public.recuperar_palabra(text, bigint) to authenticated;
