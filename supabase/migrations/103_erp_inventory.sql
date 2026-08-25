-- ERP > Inventarios: maestro de productos, kardex de entradas/salidas y regla de
-- alerta de stock mínimo. Ver src/lib/org-modules.ts para el flag de organización
-- que enciende el módulo, y 102_erp_module.sql para el permiso RBAC "erp".

create table if not exists public.erp_inventory_items (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  codigo              text not null,
  nombre              text not null,
  marca               text,
  responsable         text,
  stock_minimo        integer,
  existencia          integer not null default 0,
  activo              boolean not null default true,
  alerta_enviada_at   timestamptz,
  created_by_user_id  uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists erp_inventory_items_org_codigo_idx
  on public.erp_inventory_items (organization_id, lower(codigo));
create index if not exists erp_inventory_items_org_idx
  on public.erp_inventory_items (organization_id);

comment on table public.erp_inventory_items is 'Maestro de productos de inventario por organización — existencia es el saldo vigente, mantenido por erp_register_movement().';
comment on column public.erp_inventory_items.alerta_enviada_at is 'Marca de tiempo del último correo de stock mínimo enviado mientras existencia <= stock_minimo — se limpia al recuperarse, para no repetir la alerta en cada salida.';

create table if not exists public.erp_inventory_movements (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  item_id               uuid not null references public.erp_inventory_items(id) on delete cascade,
  tipo                  text not null check (tipo in ('entrada', 'salida', 'ajuste', 'saldo_inicial')),
  delta                 integer not null check (delta <> 0),
  existencia_resultante integer not null,
  fecha                 date not null default current_date,
  responsable           text,
  nota                  text,
  created_by_user_id    uuid references auth.users(id),
  created_at            timestamptz not null default now()
);

create index if not exists erp_inventory_movements_item_idx
  on public.erp_inventory_movements (item_id, created_at desc);
create index if not exists erp_inventory_movements_org_fecha_idx
  on public.erp_inventory_movements (organization_id, fecha desc);

comment on table public.erp_inventory_movements is 'Kardex de entradas/salidas/ajustes por producto — existencia_resultante es la foto del saldo justo después de aplicar este movimiento, para auditoría.';

create table if not exists public.erp_inventory_alert_rules (
  organization_id  uuid primary key references public.organizations(id) on delete cascade,
  enabled          boolean not null default true,
  canal_email      boolean not null default true,
  destinatarios    text[] not null default '{}',
  modo             text not null default 'al_cruzar' check (modo in ('al_cruzar', 'resumen_diario', 'ambos')),
  hora_resumen     smallint not null default 8 check (hora_resumen between 0 and 23),
  updated_at       timestamptz not null default now()
);

comment on table public.erp_inventory_alert_rules is 'Regla de alerta de stock mínimo por organización — configurable, no cableada. destinatarios vacío = se resuelve por RBAC (rol con permiso erp >= manage, ver src/lib/push/team.ts).';

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Solo lectura para miembros activos de la organización (o platform admin);
-- las escrituras van siempre por el service role desde las API routes, que ya
-- validan el permiso RBAC "erp" con requireOrgModule().

alter table public.erp_inventory_items enable row level security;
create policy erp_inventory_items_member_select on public.erp_inventory_items
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = erp_inventory_items.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );

alter table public.erp_inventory_movements enable row level security;
create policy erp_inventory_movements_member_select on public.erp_inventory_movements
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = erp_inventory_movements.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );

alter table public.erp_inventory_alert_rules enable row level security;
create policy erp_inventory_alert_rules_member_select on public.erp_inventory_alert_rules
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = erp_inventory_alert_rules.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );

-- ── RPC: registrar un movimiento y actualizar la existencia atómicamente ────
--
-- Hace en una sola transacción lo que en el Excel eran dos hojas encadenadas
-- por SUMIFS: aplica el delta a erp_inventory_items.existencia, inserta la fila
-- del kardex con la foto del saldo resultante, y decide si corresponde alertar
-- por stock mínimo — por flanco (alerta_enviada_at), para no repetir el correo
-- en cada salida mientras el producto siga bajo el mínimo.

create or replace function public.erp_register_movement(
  p_organization_id uuid,
  p_item_id uuid,
  p_tipo text,
  p_delta integer,
  p_fecha date default current_date,
  p_responsable text default null,
  p_nota text default null,
  p_created_by uuid default null
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

  -- Alias "t" obligatorio: RETURNS TABLE declara "existencia" como variable
  -- PL/pgSQL implícita, que sin calificar choca con la columna del mismo
  -- nombre ("column reference existencia is ambiguous").
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
    organization_id, item_id, tipo, delta, existencia_resultante, fecha, responsable, nota, created_by_user_id
  ) values (
    p_organization_id, p_item_id, p_tipo, p_delta, v_existencia, coalesce(p_fecha, current_date), p_responsable, p_nota, p_created_by
  )
  returning id into v_movement_id;

  return query select v_existencia, v_stock_minimo, v_debe_alertar, v_movement_id;
end;
$$;
