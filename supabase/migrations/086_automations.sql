-- Conectores de automatización (webhooks salientes/entrantes, p.ej. n8n) y workflows
-- que los usan — módulo "conectores" (conexiones) + módulo "workflows" (qué las usa).

create table if not exists public.automation_connections (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  provider_key         text not null default 'webhook_generic' check (provider_key in ('webhook_generic')),
  name                 text not null,
  webhook_url          text not null,
  -- Firma cifrada (AES-GCM, ver src/lib/crypto/token-cipher.ts) — nunca texto plano.
  secret_enc           text not null,
  -- Token de la URL de callback que el sistema externo llama para responder.
  inbound_token        text not null unique default encode(gen_random_bytes(16), 'hex'),
  status               text not null default 'active' check (status in ('active', 'disconnected', 'error')),
  last_error           text,
  last_tested_at       timestamptz,
  connected_by_user_id uuid references auth.users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists automation_connections_org_idx
  on public.automation_connections (organization_id);

comment on table public.automation_connections is
  'Conector de webhook saliente/entrante por organización (n8n y similares). Secreto cifrado a nivel de aplicación.';

alter table public.automation_connections enable row level security;

create policy automation_connections_member_select on public.automation_connections
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = automation_connections.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );

create table if not exists public.workflows (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  name                text not null,
  status              text not null default 'active' check (status in ('active', 'paused')),
  -- Grafo de nodos/aristas en formato nativo de React Flow: {nodes:[...], edges:[...]}.
  graph               jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  created_by_user_id  uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists workflows_org_idx
  on public.workflows (organization_id);

comment on table public.workflows is
  'Automatización visual por organización: grafo de disparadores/acciones que Noova ejecuta.';

alter table public.workflows enable row level security;

create policy workflows_member_select on public.workflows
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = workflows.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );

create table if not exists public.automation_event_log (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  workflow_id      uuid references public.workflows(id) on delete set null,
  connection_id    uuid references public.automation_connections(id) on delete set null,
  conversation_id  uuid,
  event_type       text not null,
  status           text not null check (status in ('sent', 'responded', 'no_response', 'error')),
  http_status      int,
  latency_ms       int,
  error_message    text,
  created_at       timestamptz not null default now()
);

create index if not exists automation_event_log_org_idx
  on public.automation_event_log (organization_id, created_at desc);

create index if not exists automation_event_log_connection_idx
  on public.automation_event_log (connection_id, created_at desc);

create index if not exists automation_event_log_workflow_idx
  on public.automation_event_log (workflow_id, created_at desc);

comment on table public.automation_event_log is
  'Historial de envíos/respuestas de automatizaciones — actividad mostrada en Conectores y Workflows.';

alter table public.automation_event_log enable row level security;

create policy automation_event_log_member_select on public.automation_event_log
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = automation_event_log.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );
