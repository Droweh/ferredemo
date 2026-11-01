-- FerroMax · seguridad a nivel de fila (RLS)
-- Los clientes solo ven productos publicados y sus fotos. El admin ve y edita todo.

alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists "products_public_read" on public.products;
create policy "products_public_read"
  on public.products for select
  to anon, authenticated
  using (
    public.is_admin()
    or (deleted_at is null and status = 'published')
  );

drop policy if exists "products_admin_insert" on public.products;
create policy "products_admin_insert"
  on public.products for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "products_admin_update" on public.products;
create policy "products_admin_update"
  on public.products for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "products_admin_delete" on public.products;
create policy "products_admin_delete"
  on public.products for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "product_images_public_read" on public.product_images;
create policy "product_images_public_read"
  on public.product_images for select
  to anon, authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.products p
      where p.id = product_id
        and p.deleted_at is null
        and p.status = 'published'
    )
  );

drop policy if exists "product_images_admin_insert" on public.product_images;
create policy "product_images_admin_insert"
  on public.product_images for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "product_images_admin_update" on public.product_images;
create policy "product_images_admin_update"
  on public.product_images for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "product_images_admin_delete" on public.product_images;
create policy "product_images_admin_delete"
  on public.product_images for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "audit_log_admin_read" on public.audit_log;
create policy "audit_log_admin_read"
  on public.audit_log for select
  to authenticated
  using (public.is_admin());

-- No hay políticas de escritura directa para audit_log:
-- las filas las crea el trigger SECURITY DEFINER.
