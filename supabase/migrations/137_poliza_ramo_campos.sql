-- Fase 5 del rediseño de pólizas — campos personalizados POR RAMO. Mismo problema que ya resuelve
-- crm_property_definitions (027_crm_property_definitions.sql) para contactos/leads, pero con un
-- eje de scoping distinto: acá es (organization_id, ramo) en vez de (user_id, entity_type), porque
-- son campos que la organización define para un ramo concreto (ej. "Placa"/"Línea" para Autos,
-- "Dirección del inmueble" para Hogar) — no por tipo de entidad genérico.
--
-- Confirma que el problema es real, no inventado: la propia Softseguros modela
-- has_formulario_adicional_ramo/_solicitudes/_beneficiarios por cada ramo_global (ver
-- 130_ramos_catalogo.sql) — cada ramo necesita campos de formulario distintos.
--
-- Los VALORES de estos campos viven en polizas.metadata (jsonb, ya existe desde 112_polizas.sql)
-- — esta tabla es solo las definiciones, igual que crm_property_definitions.

create table if not exists public.poliza_ramo_campos (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ramo_id         uuid not null references public.ramos_catalogo(id) on delete cascade,
  field_key       text not null,
  label           text not null,
  field_type      text not null default 'text' check (field_type in ('text', 'number', 'date', 'select', 'boolean')),
  options         jsonb not null default '[]'::jsonb,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, ramo_id, field_key)
);

comment on table public.poliza_ramo_campos is
  'Definiciones de campo personalizado por organización y ramo — los valores viven en polizas.metadata. Mismo patrón que crm_property_definitions, distinto eje de scoping.';

create index if not exists poliza_ramo_campos_org_ramo_idx on public.poliza_ramo_campos (organization_id, ramo_id, sort_order);

alter table public.poliza_ramo_campos enable row level security;

drop policy if exists poliza_ramo_campos_member_select on public.poliza_ramo_campos;
create policy poliza_ramo_campos_member_select on public.poliza_ramo_campos
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = poliza_ramo_campos.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );
