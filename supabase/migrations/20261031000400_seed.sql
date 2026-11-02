-- FerreDemo · semilla del catálogo
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
    (1, 'FD1001', 'Combo 15 · taladro + atornillador + amoladora 20V', 'Kit de tres máquinas a batería para armar un set de trabajo completo. Incluye taladro, atornillador y amoladora de la línea 20V, con valija para trasladarlas.', 64500, 72000, 10, 'maquinas', null, 'combos', 'toolbox', 'published'),
    (2, 'FD1002', 'Combo 30 · kit a batería con valija', 'Set de herramientas a batería pensado para mantenimiento y taller. Viene organizado en valija rígida con baterías, cargador y accesorios.', 48000, null, 10, 'maquinas', null, 'combos', 'toolbox', 'published'),
    (3, 'FD1003', 'Combo 35 · taladro percutor + rotomartillo', 'Dos equipos de perforación para alternar entre madera, metal y mampostería. El taladro percutor resuelve el trabajo liviano y el rotomartillo cubre la obra.', 62000, null, 10, 'maquinas', null, 'combos', 'toolbox', 'published'),
    (4, 'FD1004', 'Combo 42V · amoladora, taladro y llave', 'Combo de tres herramientas de la línea 42V para corte, perforación y ajuste. La llave de impacto suma fuerza para tuercas y pernos de mayor diámetro.', 77000, null, 0, 'maquinas', null, 'combos', 'toolbox', 'published'),
    (5, 'FD1005', 'Combo 20 · atornillador + linterna 20V', 'Set compacto para tareas de montaje y reparación. El atornillador trabaja con la misma batería de la linterna portátil.', 42100, 42400, 10, 'maquinas', null, 'combos', 'toolbox', 'published'),
    (6, 'FD1006', 'Super combo 5 en 1 brushless 20V', 'Cinco herramientas con motor brushless para rendimiento y autonomía. Incluye los equipos principales, baterías, cargador y valija de organización.', 57500, 93400, 10, 'maquinas', null, 'combos', 'toolbox', 'published'),
    (7, 'FD1007', 'Kit combo rotomartillo + amoladora + aspiradora', 'Kit de obra que combina perforación, corte y limpieza. La aspiradora ayuda a controlar el polvo mientras trabajás.', 30200, null, 0, 'maquinas', null, 'combos', 'toolbox', 'published'),
    (8, 'FD1008', 'Set llave de impacto ¾" 1350 Nm con accesorios', 'Set de llave de impacto de alto torque para taller mecánico y trabajo pesado. Incluye dados y accesorios para distintas medidas.', 55300, null, 10, 'herramientas', 'llaves', 'combos', 'wrench', 'published'),
    (11, 'FD1011', 'Set x2 baterías 2.0Ah + cargador 42V', 'Dos baterías de iones de litio y un cargador para mantener la línea 42V en marcha. Ideal para alternar equipos sin cortar el trabajo.', 12000, null, 10, 'linea-42v', null, 'nuevos', 'battery', 'published'),
    (12, 'FD1012', 'Lustra pulidora a batería 42V 150 mm', 'Pulidora de 150 mm para lustre y terminaciones en pintura, madera y metal. El motor brushless sostiene la velocidad en trabajos prolongados.', 22400, null, 10, 'maquinas', 'amoladoras', 'nuevos', 'grinder', 'published'),
    (13, 'FD1013', 'Amoladora angular a batería 42V 115 mm', 'Amoladora angular de 115 mm para corte y desbaste sin cables. Incluye baterías, cargador y accesorios en valija.', 25900, null, 10, 'maquinas', 'amoladoras', 'nuevos', 'grinder', 'published'),
    (14, 'FD1014', 'Rotomartillo a batería 42V SDS Plus 2.5 J', 'Rotomartillo liviano para perforar mampostería y hormigón con sistema SDS Plus. Entrega 2.5 julios de energía por golpe.', 25900, null, 10, 'maquinas', 'rotomartillos', 'nuevos', 'drill', 'published'),
    (15, 'FD1015', 'Rotomartillo a batería 42V 28 mm 4.5 J', 'Rotomartillo de mayor potencia para perforaciones de hasta 28 mm. Pensado para obra y trabajos exigentes con hormigón.', 34100, null, 10, 'maquinas', 'rotomartillos', 'nuevos', 'drill', 'published'),
    (16, 'FD1016', 'Atornillador de impacto 20V brushless 285 Nm', 'Atornillador de impacto compacto para montaje y desmontaje de tornillos y tuercas. El motor brushless entrega 285 Nm en un cuerpo liviano.', 19000, null, 0, 'maquinas', 'taladros', 'nuevos', 'driver', 'published'),
    (21, 'FD1021', 'Tornillos autoperforantes 8 x 1" · caja x100', 'Tornillos autoperforantes para fijar madera, chapa y perfiles metálicos. Caja de 100 unidades con punta Phillips y cabeza plana.', 1200, 1500, 10, 'ferreteria', 'tornilleria', null, 'screw', 'published'),
    (22, 'FD1022', 'Candado de seguridad 50 mm con llave', 'Candado de bronce de 50 mm para puertas, portones y armarios. Incluye tres llaves y arco reforzado.', 1900, 2400, 10, 'ferreteria', 'cerrajeria', null, 'lock', 'published'),
    (23, 'FD1023', 'Cargador rápido 42V con ventilación activa', 'Cargador de 42V con ventilación activa para reducir la temperatura durante la carga. Compatible con las baterías de la línea 42V.', 8900, null, 10, 'linea-42v', null, null, 'battery', 'published'),
    (24, 'FD1024', 'Batería 42V 4.0Ah compacta', 'Batería de iones de litio de 4.0Ah para las herramientas de la línea 42V. Formato compacto con indicador de carga integrado.', 14900, 17900, 10, 'linea-42v', null, null, 'battery', 'published'),
    (25, 'FD1025', 'Hidrolavadora compacta 1400W 110 bar', 'Hidrolavadora eléctrica de 1400W y 110 bar para limpieza de patios, vehículos y fachadas. Formato compacto con manguera y lanza.', 18900, 22900, 10, 'maquinas', 'hidrolavadoras', null, 'spray', 'published'),
    (26, 'FD1026', 'Compresor de aire 24L 1.5 HP', 'Compresor de aire de 24 litros y 1.5 HP para inflado, pintura y herramientas neumáticas. Funcionamiento libre de aceite y bajo nivel de ruido.', 24900, null, 10, 'maquinas', 'compresores', null, 'gear', 'published'),
    (27, 'FD1027', 'Juego de destornilladores 6 piezas', 'Juego de seis destornilladores aislados para trabajos eléctricos y de mantenimiento. Mangos ergonómicos y puntas planas y Phillips.', 3400, 3900, 10, 'herramientas', 'destornilladores', null, 'driver', 'published'),
    (28, 'FD1028', 'Nivel láser autonivelante 360°', 'Nivel láser de tres líneas y 360 grados para replanteos y alineaciones. Se autonivela y permite trabajar sobre trípode o pared.', 7900, null, 10, 'herramientas', 'niveles-y-metros', null, 'level', 'published'),
    (29, 'FD1029', 'Fumigadora de mochila 16L', 'Fumigadora manual de mochila con tanque de 16 litros para jardín y huerta. Incluye lanza ajustable y correas acolchadas.', 6900, 7900, 10, 'agro', 'fumigadoras', null, 'spray', 'published'),
    (30, 'FD1030', 'Guantes de trabajo reforzados', 'Guantes de cuero y microfibra para tareas de taller, jardín y obra. Refuerzos en palma y dedos para mayor durabilidad.', 1400, null, 10, 'agro', 'guantes', null, 'sprout', 'published'),
    (31, 'FD1031', 'Reflector LED 50W IP65', 'Reflector LED de 50W para exteriores con protección IP65. Ilumina patios, galpones y accesos con bajo consumo.', 2900, 3500, 10, 'iluminacion', 'reflectores', null, 'bulb', 'published'),
    (32, 'FD1032', 'Lámpara portátil recargable 20W', 'Lámpara de trabajo recargable con 20W de potencia y batería integrada. Se puede colgar o apoyar para iluminar talleres y obras.', 3900, null, 10, 'iluminacion', 'lamparas', null, 'bulb', 'published'),
    (33, 'FD1033', 'Cable bipolar 2 x 1.5 mm · rollo 100 m', 'Rollo de cable bipolar de 2 x 1.5 mm para instalaciones eléctricas domiciliarias. Aislación flexible y conductores de cobre.', 5800, null, 10, 'electricidad', 'cables', null, 'bolt', 'published'),
    (34, 'FD1034', 'Zapatilla 6 tomas con interruptor', 'Zapatilla de seis tomas con interruptor y cable flexible para escritorio, taller o living. Permite conectar varios equipos en un solo punto.', 2200, 2600, 10, 'electricidad', 'tomas', null, 'bolt', 'published'),
    (35, 'FD1035', 'Rodillo antigota 22 cm con mango ergonómico', 'Rodillo antigota de 22 cm para pintar paredes y techos con látex. El mango ergonómico mejora el control en superficies amplias.', 1200, null, 10, 'pinturas', 'rodillos', null, 'roller', 'published'),
    (36, 'FD1036', 'Aerosol sintético 400 ml blanco mate', 'Pintura en aerosol de 400 ml con acabado blanco mate. Cubre y renueva superficies metálicas y de madera con secado rápido.', 900, null, 10, 'pinturas', 'aerosoles', null, 'spray', 'published'),
    (37, 'FD1037', 'Manguera reforzada 1/2" x 25 m', 'Manguera reforzada de 1/2 pulgada y 25 metros para riego y limpieza. Flexible, resistente a la intemperie y compatible con conectores estándar.', 2700, 3200, 10, 'casa-jardin', 'mangueras', null, 'hose', 'published'),
    (38, 'FD1038', 'Tijera de podar profesional 8"', 'Tijera de podar de 8 pulgadas con hojas de acero y mango ergonómico. Corta ramas y tallos con menos esfuerzo.', 2100, null, 10, 'casa-jardin', 'herramientas-de-jardin', null, 'sprout', 'published')
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

-- Carga inicial. Si volvés a ejecutar esta migración, no duplica filas.
select public.seed_demo_products();
