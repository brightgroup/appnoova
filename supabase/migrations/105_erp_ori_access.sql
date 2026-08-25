-- Acceso de ORI (copiloto interno) al inventario de una organización — flag
-- aparte de erp_inventory_alert_rules porque es un concepto distinto (acceso de
-- IA interna, no una alerta) y porque puede crecer a más de un toggle a futuro
-- sin ensuciar la tabla de reglas de alerta.
--
-- Sigue habiendo dos compuertas, igual que el resto de ERP: la organización debe
-- tener el módulo ERP encendido (organizations.settings.modules.erp) Y esta fila
-- debe existir con enabled=true. Sin ninguna de las dos, Ori no ve el inventario.

create table if not exists public.erp_ori_access (
  organization_id  uuid primary key references public.organizations(id) on delete cascade,
  enabled          boolean not null default false,
  updated_at       timestamptz not null default now()
);

comment on table public.erp_ori_access is 'Si ORI (copiloto interno) puede consultar el inventario de esta organización vía la tool consultar_inventario — ver src/lib/agent-tools/inventory-lookup-tool.ts.';

alter table public.erp_ori_access enable row level security;
create policy erp_ori_access_member_select on public.erp_ori_access
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = erp_ori_access.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );
