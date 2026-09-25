-- Permite al administrador suspender y reactivar vendedores sin exponer
-- permisos generales de actualización sobre seller_profiles.

create or replace function public.admin_set_seller_status(
  p_seller_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_status text;
begin
  if not (select private.is_admin()) then
    raise exception 'Acceso no autorizado';
  end if;
  if p_status not in ('ACTIVE', 'SUSPENDED') then
    raise exception 'Estado inválido';
  end if;

  select status into v_current_status
  from public.seller_profiles
  where id = p_seller_id
  for update;

  if v_current_status is null then
    raise exception 'Vendedor no encontrado';
  end if;
  if v_current_status not in ('ACTIVE', 'SUSPENDED') then
    raise exception 'Solo se pueden administrar vendedores activos o suspendidos';
  end if;

  update public.seller_profiles
  set status = p_status,
      application_stage = p_status,
      updated_at = now()
  where id = p_seller_id;
end;
$$;

revoke all on function public.admin_set_seller_status(uuid, text) from public;
revoke all on function public.admin_set_seller_status(uuid, text) from anon;
grant execute on function public.admin_set_seller_status(uuid, text) to authenticated;

