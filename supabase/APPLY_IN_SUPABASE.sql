-- Ejecuta TODO este archivo en Supabase → SQL Editor → Run
-- (Dashboard: https://supabase.com/dashboard → tu proyecto → SQL Editor)

-- 1) Tabla base (si aún no existe)
create table if not exists public.voice_agents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  template_id   text not null,
  name          text not null,
  prompt        text not null,
  voice_name    text not null default 'Aoede',
  model         text not null default 'gemini-2.5-flash-native-audio-preview-12-2025',
  voice_speed   numeric(4,2) not null default 1.0,
  temperature   numeric(4,2) not null default 1.0,
  volume        numeric(4,2) not null default 1.0,
  llm_model     text not null default 'gemini-2.5-flash-native-audio-preview-12-2025',
  color         text,
  status        text not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.voice_agents enable row level security;

drop policy if exists "voice_agents_select_own" on public.voice_agents;
drop policy if exists "voice_agents_insert_own" on public.voice_agents;
drop policy if exists "voice_agents_update_own" on public.voice_agents;
drop policy if exists "voice_agents_delete_own" on public.voice_agents;

create policy "voice_agents_select_own" on public.voice_agents
  for select using (auth.uid() = user_id);
create policy "voice_agents_insert_own" on public.voice_agents
  for insert with check (auth.uid() = user_id);
create policy "voice_agents_update_own" on public.voice_agents
  for update using (auth.uid() = user_id);
create policy "voice_agents_delete_own" on public.voice_agents
  for delete using (auth.uid() = user_id);

-- 2) Referencia a plantilla demo en código (no es una fila de plantilla global)
alter table public.voice_agents
  add column if not exists source_template text;

update public.voice_agents
set source_template = split_part(template_id, '::', 1)
where source_template is null;

-- 3) Métricas + permitir varios agentes por plantilla
alter table public.voice_agents
  add column if not exists contacts_count integer not null default 0,
  add column if not exists contacted_count integer not null default 0,
  add column if not exists calls_count integer not null default 0,
  add column if not exists goals_achieved integer not null default 0,
  add column if not exists cost_usd numeric(12, 4) not null default 0,
  add column if not exists quality_label text not null default 'Aprendiendo';

alter table public.voice_agents
  drop constraint if exists voice_agents_user_id_template_id_key;

create index if not exists voice_agents_user_id_idx on public.voice_agents(user_id);
create index if not exists voice_agents_user_updated_idx
  on public.voice_agents (user_id, updated_at desc);

-- 4) Contextos de empresa / marca (004)
create table if not exists public.company_contexts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  content     text not null default '',
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists company_contexts_user_id_idx
  on public.company_contexts (user_id);

alter table public.company_contexts enable row level security;

drop policy if exists "company_contexts_select_own" on public.company_contexts;
drop policy if exists "company_contexts_insert_own" on public.company_contexts;
drop policy if exists "company_contexts_update_own" on public.company_contexts;
drop policy if exists "company_contexts_delete_own" on public.company_contexts;

create policy "company_contexts_select_own" on public.company_contexts
  for select using (auth.uid() = user_id);
create policy "company_contexts_insert_own" on public.company_contexts
  for insert with check (auth.uid() = user_id);
create policy "company_contexts_update_own" on public.company_contexts
  for update using (auth.uid() = user_id);
create policy "company_contexts_delete_own" on public.company_contexts
  for delete using (auth.uid() = user_id);

alter table public.voice_agents
  add column if not exists company_context_id uuid references public.company_contexts(id) on delete set null;

create index if not exists voice_agents_company_context_idx
  on public.voice_agents (company_context_id);

-- 5) URL del sitio web por contexto de marca
alter table public.company_contexts
  add column if not exists website_url text not null default '';

-- 6) Líneas telefónicas por tenant
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
  on public.phone_numbers (e164) where status = 'active';

create unique index if not exists phone_numbers_agent_active_idx
  on public.phone_numbers (voice_agent_id)
  where status = 'active' and voice_agent_id is not null;

create index if not exists phone_numbers_user_idx
  on public.phone_numbers (user_id, status);

alter table public.phone_numbers enable row level security;

drop policy if exists "phone_numbers_select_own" on public.phone_numbers;
create policy "phone_numbers_select_own" on public.phone_numbers
  for select using (auth.uid() = user_id);

