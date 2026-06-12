-- Líneas WhatsApp Business (Fase 0: Twilio, onboarding manual)
create table if not exists public.whatsapp_channels (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  text_agent_id               uuid references public.text_agents(id) on delete set null,

  provider                    text not null default 'twilio',
  e164                        text not null,
  twilio_messaging_service_sid text,
  friendly_name               text,
  waba_id                     text,
  status                      text not null default 'pending',

  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create unique index if not exists whatsapp_channels_e164_active_idx
  on public.whatsapp_channels (e164)
  where status = 'active';

create index if not exists whatsapp_channels_user_idx
  on public.whatsapp_channels (user_id, status);

alter table public.whatsapp_channels enable row level security;

drop policy if exists "whatsapp_channels_select_own" on public.whatsapp_channels;
drop policy if exists "whatsapp_channels_update_own" on public.whatsapp_channels;

create policy "whatsapp_channels_select_own" on public.whatsapp_channels
  for select using (auth.uid() = user_id);

create policy "whatsapp_channels_update_own" on public.whatsapp_channels
  for update using (auth.uid() = user_id);

-- Evita procesar dos veces el mismo webhook de Twilio (reintentos)
create table if not exists public.whatsapp_inbound_dedup (
  message_sid   text primary key,
  created_at    timestamptz not null default now()
);
