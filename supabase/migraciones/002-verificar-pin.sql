-- Comprueba usuario y contraseña de 4 números con el límite de intentos dentro de la base.
-- El bloqueo de la fila (for update) hace que las peticiones a la vez vayan una por una: así nadie se salta
-- el límite de 5 intentos mandando muchas contraseñas juntas. Solo la función «entrar» (service_role) la usa.

create or replace function public.verificar_pin(p_usuario text, p_pin text)
returns table (estado text, out_user_id uuid, out_usuario text, minutos int)
language plpgsql security definer set search_path = ''
as $$
declare
  r public.perfiles%rowtype;
begin
  select * into r from public.perfiles p where lower(p.usuario) = lower(p_usuario) for update;
  if not found then
    return query select 'no'::text, null::uuid, null::text, 0;
    return;
  end if;

  if r.bloqueado_hasta is not null and r.bloqueado_hasta > now() then
    return query select 'bloqueado'::text, r.user_id, r.usuario, greatest(1, ceil(extract(epoch from (r.bloqueado_hasta - now())) / 60))::int;
    return;
  end if;

  if r.pin = p_pin then
    update public.perfiles p set intentos = 0, bloqueado_hasta = null where p.user_id = r.user_id;
    return query select 'ok'::text, r.user_id, r.usuario, 0;
    return;
  end if;

  if r.intentos + 1 >= 5 then
    update public.perfiles p set intentos = 0, bloqueado_hasta = now() + interval '15 minutes' where p.user_id = r.user_id;
    return query select 'bloqueado'::text, r.user_id, r.usuario, 15;
    return;
  end if;

  update public.perfiles p set intentos = r.intentos + 1 where p.user_id = r.user_id;
  return query select 'mal'::text, r.user_id, r.usuario, 0;
end $$;

revoke all on function public.verificar_pin(text, text) from public, anon, authenticated;
grant execute on function public.verificar_pin(text, text) to service_role;
