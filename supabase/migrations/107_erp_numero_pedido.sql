-- Número de pedido/orden en los movimientos de inventario — permite agrupar
-- varios productos (varias filas de erp_inventory_movements, cada una con su
-- propio delta) bajo un mismo número, para filtrarlos juntos después. Es un
-- campo libre (no hay tabla de "pedidos" separada): agrupar es simplemente que
-- varias filas compartan el mismo texto en esta columna.

alter table public.erp_inventory_movements add column if not exists numero_pedido text;

create index if not exists erp_inventory_movements_org_pedido_idx
  on public.erp_inventory_movements (organization_id, numero_pedido)
  where numero_pedido is not null;

comment on column public.erp_inventory_movements.numero_pedido is 'Número de pedido/orden opcional — varios movimientos (distintos productos) pueden compartir el mismo número para agruparse y filtrarse juntos.';

-- erp_register_movement gana un parámetro opcional al final (compatible con
-- las llamadas existentes, que no lo mandan y caen en null) — ver
-- 103_erp_inventory.sql para el resto de la función, sin cambios.
create or replace function public.erp_register_movement(
  p_organization_id uuid,
  p_item_id uuid,
  p_tipo text,
  p_delta integer,
  p_fecha date default current_date,
  p_responsable text default null,
  p_nota text default null,
  p_created_by uuid default null,
  p_numero_pedido text default null
)
returns table (existencia integer, stock_minimo integer, debe_alertar boolean, movement_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existencia integer;
  v_stock_minimo integer;
  v_alerta_enviada_at timestamptz;
  v_debe_alertar boolean := false;
  v_movement_id uuid;
begin
  if p_delta = 0 then
    raise exception 'delta no puede ser 0';
  end if;
  if p_tipo not in ('entrada', 'salida', 'ajuste', 'saldo_inicial') then
    raise exception 'tipo de movimiento inválido: %', p_tipo;
  end if;

  update public.erp_inventory_items t
  set existencia = t.existencia + p_delta, updated_at = now()
  where t.id = p_item_id and t.organization_id = p_organization_id
  returning t.existencia, t.stock_minimo, t.alerta_enviada_at
  into v_existencia, v_stock_minimo, v_alerta_enviada_at;

  if not found then
    raise exception 'Producto no encontrado en esta organización';
  end if;

  if v_stock_minimo is not null and v_existencia <= v_stock_minimo then
    if v_alerta_enviada_at is null then
      v_debe_alertar := true;
      update public.erp_inventory_items set alerta_enviada_at = now() where id = p_item_id;
    end if;
  elsif v_alerta_enviada_at is not null then
    update public.erp_inventory_items set alerta_enviada_at = null where id = p_item_id;
  end if;

  insert into public.erp_inventory_movements (
    organization_id, item_id, tipo, delta, existencia_resultante, fecha, responsable, nota, created_by_user_id, numero_pedido
  ) values (
    p_organization_id, p_item_id, p_tipo, p_delta, v_existencia, coalesce(p_fecha, current_date), p_responsable, p_nota, p_created_by, p_numero_pedido
  )
  returning id into v_movement_id;

  return query select v_existencia, v_stock_minimo, v_debe_alertar, v_movement_id;
end;
$$;
