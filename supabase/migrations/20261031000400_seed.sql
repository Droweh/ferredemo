-- FerroMax · semilla del catálogo
-- Los 32 productos originales de la demo, con sus IDs y códigos.
-- Esta función también la usa reset_demo_catalog().

create or replace function public.seed_demo_products()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('ferromax.audit_skip', 'on', true);

  insert into public.products
    (id, code, name, description, price_cents, old_price_cents, stock, category_id, subcategory_id, collection, icon, status)
  values
    (1, 'FM1001', 'Combo 15 · taladro + atornillador + amoladora 20V', '', 64500, 72000, 10, 'maquinas', null, 'combos', 'toolbox', 'published'),
    (2, 'FM1002', 'Combo 30 · kit a batería con valija', '', 48000, null, 10, 'maquinas', null, 'combos', 'toolbox', 'published'),
    (3, 'FM1003', 'Combo 35 · taladro percutor + rotomartillo', '', 62000, null, 10, 'maquinas', null, 'combos', 'toolbox', 'published'),
    (4, 'FM1004', 'Combo 42V · amoladora, taladro y llave', '', 77000, null, 0, 'maquinas', null, 'combos', 'toolbox', 'published'),
    (5, 'FM1005', 'Combo 20 · atornillador + linterna 20V', '', 42100, 42400, 10, 'maquinas', null, 'combos', 'toolbox', 'published'),
    (6, 'FM1006', 'Super combo 5 en 1 brushless 20V', '', 57500, 93400, 10, 'maquinas', null, 'combos', 'toolbox', 'published'),
    (7, 'FM1007', 'Kit combo rotomartillo + amoladora + aspiradora', '', 30200, null, 0, 'maquinas', null, 'combos', 'toolbox', 'published'),
    (8, 'FM1008', 'Set llave de impacto ¾" 1350 Nm con accesorios', '', 55300, null, 10, 'herramientas', 'llaves', 'combos', 'wrench', 'published'),
    (11, 'FM1011', 'Set x2 baterías 2.0Ah + cargador 42V', '', 12000, null, 10, 'linea-42v', null, 'nuevos', 'battery', 'published'),
    (12, 'FM1012', 'Lustra pulidora a batería 42V 150 mm', '', 22400, null, 10, 'maquinas', 'amoladoras', 'nuevos', 'grinder', 'published'),
    (13, 'FM1013', 'Amoladora angular a batería 42V 115 mm', '', 25900, null, 10, 'maquinas', 'amoladoras', 'nuevos', 'grinder', 'published'),
    (14, 'FM1014', 'Rotomartillo a batería 42V SDS Plus 2.5 J', '', 25900, null, 10, 'maquinas', 'rotomartillos', 'nuevos', 'drill', 'published'),
    (15, 'FM1015', 'Rotomartillo a batería 42V 28 mm 4.5 J', '', 34100, null, 10, 'maquinas', 'rotomartillos', 'nuevos', 'drill', 'published'),
    (16, 'FM1016', 'Atornillador de impacto 20V brushless 285 Nm', '', 19000, null, 0, 'maquinas', 'taladros', 'nuevos', 'driver', 'published'),
    (21, 'FM1021', 'Tornillos autoperforantes 8 x 1" · caja x100', '', 1200, 1500, 10, 'ferreteria', 'tornilleria', null, 'screw', 'published'),
    (22, 'FM1022', 'Candado de seguridad 50 mm con llave', '', 1900, 2400, 10, 'ferreteria', 'cerrajeria', null, 'lock', 'published'),
    (23, 'FM1023', 'Cargador rápido 42V con ventilación activa', '', 8900, null, 10, 'linea-42v', null, null, 'battery', 'published'),
    (24, 'FM1024', 'Batería 42V 4.0Ah compacta', '', 14900, 17900, 10, 'linea-42v', null, null, 'battery', 'published'),
    (25, 'FM1025', 'Hidrolavadora compacta 1400W 110 bar', '', 18900, 22900, 10, 'maquinas', 'hidrolavadoras', null, 'spray', 'published'),
    (26, 'FM1026', 'Compresor de aire 24L 1.5 HP', '', 24900, null, 10, 'maquinas', 'compresores', null, 'gear', 'published'),
    (27, 'FM1027', 'Juego de destornilladores 6 piezas', '', 3400, 3900, 10, 'herramientas', 'destornilladores', null, 'driver', 'published'),
    (28, 'FM1028', 'Nivel láser autonivelante 360°', '', 7900, null, 10, 'herramientas', 'niveles-y-metros', null, 'level', 'published'),
    (29, 'FM1029', 'Fumigadora de mochila 16L', '', 6900, 7900, 10, 'agro', 'fumigadoras', null, 'spray', 'published'),
    (30, 'FM1030', 'Guantes de trabajo reforzados', '', 1400, null, 10, 'agro', 'guantes', null, 'sprout', 'published'),
    (31, 'FM1031', 'Reflector LED 50W IP65', '', 2900, 3500, 10, 'iluminacion', 'reflectores', null, 'bulb', 'published'),
    (32, 'FM1032', 'Lámpara portátil recargable 20W', '', 3900, null, 10, 'iluminacion', 'lamparas', null, 'bulb', 'published'),
    (33, 'FM1033', 'Cable bipolar 2 x 1.5 mm · rollo 100 m', '', 5800, null, 10, 'electricidad', 'cables', null, 'bolt', 'published'),
    (34, 'FM1034', 'Zapatilla 6 tomas con interruptor', '', 2200, 2600, 10, 'electricidad', 'tomas', null, 'bolt', 'published'),
    (35, 'FM1035', 'Rodillo antigota 22 cm con mango ergonómico', '', 1200, null, 10, 'pinturas', 'rodillos', null, 'roller', 'published'),
    (36, 'FM1036', 'Aerosol sintético 400 ml blanco mate', '', 900, null, 10, 'pinturas', 'aerosoles', null, 'spray', 'published'),
    (37, 'FM1037', 'Manguera reforzada 1/2" x 25 m', '', 2700, 3200, 10, 'casa-jardin', 'mangueras', null, 'hose', 'published'),
    (38, 'FM1038', 'Tijera de podar profesional 8"', '', 2100, null, 10, 'casa-jardin', 'herramientas-de-jardin', null, 'sprout', 'published')
  on conflict (id) do nothing;

  perform setval(
    pg_get_serial_sequence('public.products', 'id'),
    greatest((select coalesce(max(id), 1) from public.products), 1),
    true
  );

  perform set_config('ferromax.audit_skip', 'off', true);
end;
$$;

revoke all on function public.seed_demo_products() from public;
revoke all on function public.seed_demo_products() from anon, authenticated;

-- Carga inicial. Si volv?s a ejecutar esta migraci?n, no duplica filas.
select public.seed_demo_products();
