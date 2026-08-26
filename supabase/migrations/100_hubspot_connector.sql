-- Conector HubSpot por organización — primera fase de automatizaciones
-- directas con HubSpot (sin pasar por WhatsApp de Noova). Mismo patrón que
-- calendar_connections (075): una conexión por organización, tokens
-- cifrados a nivel de aplicación, RLS de solo lectura para miembros activos
-- (el backend real usa adminClient(), service role).

create table if not exists public.hubspot_connections (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  -- 'private_app': el cliente pega un token de una Private App de su portal (fase 1).
  -- 'oauth': app pública de Noova, el cliente autoriza por consentimiento (fase 2, no implementada aún).
  auth_mode             text not null default 'private_app' check (auth_mode in ('private_app', 'oauth')),
  portal_id             text,
  hub_domain            text,
  -- Cifrado AES-GCM, ver src/lib/crypto/token-cipher.ts — nunca texto plano.
  access_token_enc      text not null,
  -- Solo aplica a auth_mode='oauth'. Una Private App no expira ni rota.
  refresh_token_enc     text,
  token_expires_at      timestamptz,
  status                text not null default 'active' check (status in ('active', 'disconnected', 'error')),
  last_error            text,
  connected_by_user_id  uuid references auth.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint hubspot_connections_org_unique unique (organization_id)
);

create index if not exists hubspot_connections_org_idx
  on public.hubspot_connections (organization_id);

comment on table public.hubspot_connections is
  'Conector HubSpot por organización (Private App token hoy, OAuth después). Tokens cifrados a nivel de aplicación.';

alter table public.hubspot_connections enable row level security;

create policy hubspot_connections_member_select on public.hubspot_connections
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = hubspot_connections.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );

-- Control de duplicados de eventos entrantes de HubSpot (equivalente a la
-- tabla control_duplicados del flujo de n8n que se migra) — HubSpot reintenta
-- webhooks que no respondieron a tiempo, y un mismo mensaje puede llegar más
-- de una vez. `message_id` como llave primaria hace el insert idempotente:
-- si ya existe, el INSERT ... ON CONFLICT DO NOTHING no inserta fila y el
-- runner corta ahí sin reprocesar.
create table if not exists public.hubspot_processed_messages (
  message_id       text primary key,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  thread_id        text not null,
  created_at       timestamptz not null default now()
);

create index if not exists hubspot_processed_messages_created_idx
  on public.hubspot_processed_messages (created_at);

comment on table public.hubspot_processed_messages is
  'Dedup de eventos conversation.newMessage de HubSpot ya procesados, por message_id. Candidato a limpieza periódica (created_at > 30 días) cuando haya cron jobs de mantenimiento.';

-- Tabla solo-servidor (mismo patrón que whatsapp_inbound_dedup, ver 059_security_cleanup.sql):
-- RLS activo sin ninguna policy = denegado para cualquier JWT de cliente; solo el runner
-- server-side (service role, que hace bypass de RLS) la lee/escribe.
alter table public.hubspot_processed_messages enable row level security;
