-- Contraseña del modo programador. Vive cifrada (bcrypt) en la base y la comprueba la función de servidor «programador»,
-- con límite de 5 intentos y bloqueo de 15 minutos. Ya no está escrita en el código de la página.
--
-- Para ponerla o cambiarla (cambia <CLAVE>; no la guardes en el repositorio):
--   insert into public.clave_programador (id, clave) values (true, extensions.crypt('<CLAVE>', extensions.gen_salt('bf')))
--   on conflict (id) do update set clave = excluded.clave, intentos = 0, bloqueado_hasta = null;

create table if not exists public.clave_programador (
  id boolean primary key default true check (id),
  clave text not null,
  intentos int not null default 0,
  bloqueado_hasta timestamptz
);
alter table public.clave_programador enable row level security;
comment on table public.clave_programador is 'Una sola fila. Sin policies a propósito: solo la función verificar_clave_programador la toca.';

create or replace function public.verificar_clave_programador(p_clave text)
returns table (estado text, out_user_id uuid, out_usuario text, minutos int)
language plpgsql security definer set search_path = ''
as $$
declare
  r public.clave_programador%rowtype;
  uid uuid;
  nombre text;
begin
  select * into r from public.clave_programador c where c.id for update;
  if not found then
    return query select 'no'::text, null::uuid, null::text, 0;
    return;
  end if;
  if r.bloqueado_hasta is not null and r.bloqueado_hasta > now() then
    return query select 'bloqueado'::text, null::uuid, null::text, greatest(1, ceil(extract(epoch from (r.bloqueado_hasta - now())) / 60))::int;
    return;
  end if;
  if r.clave = extensions.crypt(p_clave, r.clave) then
    select g.user_id, p.usuario into uid, nombre
      from public.programadores g left join public.perfiles p on p.user_id = g.user_id
      order by g.creado limit 1;
    if uid is null then
      return query select 'no'::text, null::uuid, null::text, 0;
      return;
    end if;
    update public.clave_programador c set intentos = 0, bloqueado_hasta = null where c.id;
    return query select 'ok'::text, uid, nombre, 0;
    return;
  end if;
  if r.intentos + 1 >= 5 then
    update public.clave_programador c set intentos = 0, bloqueado_hasta = now() + interval '15 minutes' where c.id;
    return query select 'bloqueado'::text, null::uuid, null::text, 15;
    return;
  end if;
  update public.clave_programador c set intentos = r.intentos + 1 where c.id;
  return query select 'mal'::text, null::uuid, null::text, 0;
end $$;
revoke all on function public.verificar_clave_programador(text) from public, anon, authenticated;
grant execute on function public.verificar_clave_programador(text) to service_role;
