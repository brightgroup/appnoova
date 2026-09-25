-- Canales Messenger e Instagram Direct — conexión directa con Meta Graph API
-- (sin Twilio). Una fila por canal conectado: una Página de Facebook da un
-- canal 'messenger' y, si tiene Instagram profesional vinculado, otro
-- 'instagram' con el mismo token de página. Mismo patrón que
-- hubspot_connections (100): token cifrado a nivel de aplicación
-- (src/lib/crypto/token-cipher.ts), RLS de solo lectura para miembros
-- activos; el backend usa service role.

create table if not exists public.meta_messaging_channels (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  -- Dueño de las conversaciones (text_agent_conversations.user_id), igual que whatsapp_channels.user_id.
  user_id               uuid not null references auth.users(id) on delete cascade,
  text_agent_id         uuid references public.text_agents(id) on delete set null,
  platform              text not null check (platform in ('messenger', 'instagram')),
  page_id               text not null,
  page_name             text,
  -- Solo platform='instagram': ID de la cuenta profesional (llega como recipient.id en el webhook).
  ig_user_id            text,
  ig_username           text,
  -- Token de página (no expira mientras el usuario no cambie contraseña ni quite la app).
  page_access_token_enc text not null,
  status                text not null default 'active' check (status in ('active', 'paused', 'disconnected')),
  last_error            text,
  connected_by_user_id  uuid references auth.users(id),
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint meta_messaging_channels_ig_required
    check (platform <> 'instagram' or ig_user_id is not null)
);

-- Una página / cuenta de Instagram solo puede estar activa en una organización a la vez:
-- el webhook resuelve el canal por el ID de Meta y no puede haber ambigüedad.
create unique index if not exists meta_messaging_channels_messenger_active_idx
  on public.meta_messaging_channels (page_id)
  where platform = 'messenger' and status <> 'disconnected';

create unique index if not exists meta_messaging_channels_instagram_active_idx
  on public.meta_messaging_channels (ig_user_id)
  where platform = 'instagram' and status <> 'disconnected';

create index if not exists meta_messaging_channels_org_idx
  on public.meta_messaging_channels (organization_id, platform);

comment on table public.meta_messaging_channels is
  'Canales Messenger / Instagram Direct conectados vía Facebook Login for Business. Token de página cifrado a nivel de aplicación.';

alter table public.meta_messaging_channels enable row level security;

drop policy if exists meta_messaging_channels_member_select on public.meta_messaging_channels;
create policy meta_messaging_channels_member_select on public.meta_messaging_channels
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = meta_messaging_channels.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );

-- Meta reintenta webhooks que no respondieron 200 a tiempo: el `mid` de cada
-- mensaje como llave primaria hace el procesamiento idempotente.
create table if not exists public.meta_messaging_inbound_dedup (
  message_id   text primary key,
  created_at   timestamptz not null default now()
);

alter table public.meta_messaging_inbound_dedup enable row level security;
