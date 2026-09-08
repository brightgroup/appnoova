-- Cola de cotizaciones pendientes (Noova Seguros, rediseño 2026-09-05) — el
-- corredor pidió explícitamente que, por ahora, la IA CALIFIQUE al cliente
-- (reúna placa + datos del tomador) pero sea el ASESOR HUMANO quien decida
-- solicitar el precio real desde la plataforma con un clic, en vez de que la
-- IA cotice sola de punta a punta. La autonomía completa sigue existiendo
-- (quoting_rules.autoQuote, ver src/lib/insurers/quoting-rules.ts) para el
-- corredor que sí la quiera activar — esta tabla es la cola para cuando NO
-- está activada, y también el historial cuando sí lo está.
--
-- Escopada por organization_id (no por user_id como crm_contacts/polizas):
-- es una cola de trabajo del EQUIPO del corredor, cualquier asesor de la
-- organización debe poder verla y atenderla, no es un registro personal de
-- un solo usuario. contact_id/lead_id/conversation_id son referencias
-- sueltas sin FK estricta a propósito — crm_contacts/crm_leads están
-- escopados por user_id (modelo distinto), no por organization_id.

create table if not exists public.insurance_quote_requests (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  contact_id            uuid,
  lead_id               uuid,
  conversation_id       text,
  source                text not null default 'whatsapp' check (source in ('whatsapp', 'web', 'ori', 'manual')),
  ramo                  text not null default 'autos',
  placa                 text,
  vehiculo              jsonb not null default '{}'::jsonb,
  tomador               jsonb not null default '{}'::jsonb,
  estado                text not null default 'pendiente' check (estado in ('pendiente', 'cotizada', 'enviada_externa', 'cerrada', 'descartada')),
  resultado             jsonb,
  quoted_by_user_id     uuid references auth.users(id),
  -- Label del sistema externo que empujó el resultado (ej. 'agentemotor'), cuando estado llega vía webhook en vez del conector propio.
  external_source       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists insurance_quote_requests_org_estado_idx
  on public.insurance_quote_requests (organization_id, estado, created_at desc);

create index if not exists insurance_quote_requests_placa_idx
  on public.insurance_quote_requests (organization_id, placa);

comment on table public.insurance_quote_requests is
  'Cola de cotizaciones de seguros pendientes/atendidas — el asesor humano solicita el precio real desde acá cuando el agente de IA solo califica (quoting_rules.autoQuote = false).';

alter table public.insurance_quote_requests enable row level security;

create policy insurance_quote_requests_member_select on public.insurance_quote_requests
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = insurance_quote_requests.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );

-- Fuentes externas que pueden EMPUJAR un resultado de cotización a Noova (ej.
-- Agentemotor: valida hoy que puede enviar información a Noova pero no
-- recibirla, así que el único camino es que Noova exponga un webhook de
-- entrada). Un token por organización+etiqueta, mismo patrón que
-- automation_connections.inbound_token (086).
create table if not exists public.external_quote_sources (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label           text not null,
  inbound_token   text not null unique default encode(gen_random_bytes(16), 'hex'),
  status          text not null default 'active' check (status in ('active', 'disconnected')),
  created_by_user_id uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

create index if not exists external_quote_sources_org_idx
  on public.external_quote_sources (organization_id);

comment on table public.external_quote_sources is
  'Fuentes externas autorizadas a empujar resultados de cotización vía webhook (ej. Agentemotor) — un token de entrada por fuente.';

alter table public.external_quote_sources enable row level security;

create policy external_quote_sources_member_select on public.external_quote_sources
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = external_quote_sources.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );
