-- Dos cosas encontradas probando el cotizador de autos por WhatsApp
-- (2026-09-08): (1) cualquiera que le escriba una placa a un agente gasta un
-- crédito real de Verifik antes de dar ningún dato que demuestre que es un
-- prospecto serio — hace falta un límite anti-abuso; (2) algunos corredores
-- ya tendrán su propia cuenta de Verifik para otros usos — permitir
-- conectarla en vez de forzar siempre la cuenta compartida de Noova (con margen).

-- 1) Verifik como conector opcional por organización — mismo mecanismo que
-- ya usa La Equidad (bóveda de credenciales cifradas). Si el corredor no
-- conecta la suya, se sigue usando VERIFIK_TOKEN (la cuenta de Noova).
alter table public.insurer_connections drop constraint if exists insurer_connections_provider_key_check;
alter table public.insurer_connections
  add constraint insurer_connections_provider_key_check check (provider_key in ('la_equidad', 'verifik'));

-- 2) Límite anti-abuso de consultas a Verifik por contacto — solo aplica
-- cuando se usa la cuenta COMPARTIDA de Noova (si el corredor conectó la
-- suya propia, ese gasto es suyo, no de Noova, y no se limita acá).
create table if not exists public.vehicle_lookup_log (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  contact_key       text not null,
  plate             text not null,
  created_at        timestamptz not null default now()
);

create index if not exists vehicle_lookup_log_org_contact_idx
  on public.vehicle_lookup_log (organization_id, contact_key, created_at desc);

comment on table public.vehicle_lookup_log is
  'Registro de cada consulta real a Verifik (cuenta compartida de Noova) — usado para limitar cuántas puede hacer el mismo contacto en 24h y evitar gasto por abuso antes de que haya un prospecto real.';

alter table public.vehicle_lookup_log enable row level security;

create policy vehicle_lookup_log_member_select on public.vehicle_lookup_log
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = vehicle_lookup_log.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );
