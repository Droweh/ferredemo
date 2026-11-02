-- FerreDemo · restauración de la demo
-- Solo el admin puede ejecutarla. El frontend borra primero las fotos del
-- bucket y después llama a esta función con supabase.rpc('reset_demo_catalog').

create or replace function public.reset_demo_catalog()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede restaurar la demo.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('ferromax_reset_demo'));
  perform set_config('ferromax.audit_skip', 'on', true);

  delete from public.products;
  delete from public.audit_log;

  perform public.seed_demo_products();

  insert into public.audit_log (user_id, action, entity, entity_id, before, after)
  values (auth.uid(), 'RESET_DEMO', 'demo', 'catalog', null, null);

  perform set_config('ferromax.audit_skip', 'off', true);
end;
$$;

revoke all on function public.reset_demo_catalog() from public;
revoke all on function public.reset_demo_catalog() from anon;
grant execute on function public.reset_demo_catalog() to authenticated;
