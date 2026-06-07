-- Líneas telefónicas por tenant (compradas o verificadas)
create table if not exists public.phone_numbers (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  voice_agent_id      uuid references public.voice_agents(id) on delete set null,

  provider            text not null default 'twilio',
  provider_sid        text not null,
  provider_account_ref text,

  e164                text not null,
  friendly_name       text,
  country_code        text not null default 'US',
  number_type         text not null default 'purchased',

  status              text not null default 'active',
  capabilities        jsonb not null default '{"voice": true, "sms": false}'::jsonb,

  inbound_webhook_url text,
  voice_config        jsonb not null default '{}'::jsonb,

  monthly_cost_usd    numeric(8, 4),
  assigned_by         uuid references auth.users(id),
  assigned_at         timestamptz not null default now(),
  released_at         timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (provider, provider_sid)
);

create unique index if not exists phone_numbers_e164_active_idx
  on public.phone_numbers (e164)
  where status = 'active';

create unique index if not exists phone_numbers_agent_active_idx
  on public.phone_numbers (voice_agent_id)
  where status = 'active' and voice_agent_id is not null;

create index if not exists phone_numbers_user_idx
  on public.phone_numbers (user_id, status);

alter table public.phone_numbers enable row level security;

drop policy if exists "phone_numbers_select_own" on public.phone_numbers;
create policy "phone_numbers_select_own" on public.phone_numbers
  for select using (auth.uid() = user_id);
