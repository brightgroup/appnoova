-- Permite borrar un movimiento de inventario (limpieza de pruebas, corrección de
-- un error de captura) revirtiendo su efecto sobre la existencia de forma
-- atómica — mismo patrón que erp_register_movement (103_erp_inventory.sql):
-- recalcula alerta_enviada_at según el saldo resultante tras la reversión.
-- Gateado en la API a nivel "manage" (dueño/admin de la organización).

create or replace function public.erp_delete_movement(
  p_organization_id uuid,
  p_movement_id uuid
)
returns table (item_id uuid, existencia integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
  v_delta integer;
  v_existencia integer;
  v_stock_minimo integer;
  v_alerta_enviada_at timestamptz;
begin
  select em.item_id, em.delta into v_item_id, v_delta
  from public.erp_inventory_movements em
  where em.id = p_movement_id and em.organization_id = p_organization_id;

  if not found then
    raise exception 'Movimiento no encontrado';
  end if;

  delete from public.erp_inventory_movements
  where id = p_movement_id and organization_id = p_organization_id;

  -- Alias "t" obligatorio: RETURNS TABLE declara "existencia" como variable
  -- PL/pgSQL implícita, que sin calificar choca con la columna del mismo
  -- nombre ("column reference existencia is ambiguous").
  update public.erp_inventory_items t
  set existencia = t.existencia - v_delta, updated_at = now()
  where t.id = v_item_id and t.organization_id = p_organization_id
  returning t.existencia, t.stock_minimo, t.alerta_enviada_at
  into v_existencia, v_stock_minimo, v_alerta_enviada_at;

  if v_stock_minimo is not null and v_existencia <= v_stock_minimo then
    if v_alerta_enviada_at is null then
      update public.erp_inventory_items set alerta_enviada_at = now() where id = v_item_id;
    end if;
  elsif v_alerta_enviada_at is not null then
    update public.erp_inventory_items set alerta_enviada_at = null where id = v_item_id;
  end if;

  return query select v_item_id, v_existencia;
end;
$$;
