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

-- 7) Números de prueba (celulares desde los que el usuario llama)
create table if not exists public.test_phone_numbers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text not null default 'Mi celular',
  e164        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists test_phone_numbers_user_e164_idx
  on public.test_phone_numbers (user_id, e164);

create index if not exists test_phone_numbers_user_idx
  on public.test_phone_numbers (user_id);

alter table public.test_phone_numbers enable row level security;

drop policy if exists "test_phone_numbers_select_own" on public.test_phone_numbers;
create policy "test_phone_numbers_select_own" on public.test_phone_numbers
  for select using (auth.uid() = user_id);

drop policy if exists "test_phone_numbers_insert_own" on public.test_phone_numbers;
create policy "test_phone_numbers_insert_own" on public.test_phone_numbers
  for insert with check (auth.uid() = user_id);

drop policy if exists "test_phone_numbers_update_own" on public.test_phone_numbers;
create policy "test_phone_numbers_update_own" on public.test_phone_numbers
  for update using (auth.uid() = user_id);

drop policy if exists "test_phone_numbers_delete_own" on public.test_phone_numbers;
create policy "test_phone_numbers_delete_own" on public.test_phone_numbers
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- Agentes de TEXTO (independiente de voice_agents — tabla propia: text_agents)
-- =============================================================================

create table if not exists public.text_agents (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  template_id         text not null,
  source_template     text not null default 'customer-assistant',
  name                text not null,
  prompt              text not null,
  company_context_id  uuid references public.company_contexts(id) on delete set null,
  temperature         numeric(4,2) not null default 0.7,
  llm_model           text not null default 'gemini-2.5-flash',
  max_output_tokens   integer not null default 2048,
  color               text,
  status              text not null default 'active',
  conversations_count integer not null default 0,
  messages_count      integer not null default 0,
  goals_achieved      integer not null default 0,
  cost_usd            numeric(12,4) not null default 0,
  quality_label       text not null default 'Aprendiendo',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists text_agents_user_updated_idx
  on public.text_agents (user_id, updated_at desc);

alter table public.text_agents enable row level security;

drop policy if exists "text_agents_select_own" on public.text_agents;
drop policy if exists "text_agents_insert_own" on public.text_agents;
drop policy if exists "text_agents_update_own" on public.text_agents;
drop policy if exists "text_agents_delete_own" on public.text_agents;

create policy "text_agents_select_own" on public.text_agents
  for select using (auth.uid() = user_id);
create policy "text_agents_insert_own" on public.text_agents
  for insert with check (auth.uid() = user_id);
create policy "text_agents_update_own" on public.text_agents
  for update using (auth.uid() = user_id);
create policy "text_agents_delete_own" on public.text_agents
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- Registro de CHATS de texto (independiente de voice_agent_calls)
-- =============================================================================

create table if not exists public.text_agent_conversations (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  text_agent_id       uuid not null references public.text_agents(id) on delete cascade,
  channel             text not null default 'web_test',
  contact_label       text not null default 'Prueba web',
  messages_count      integer not null default 0,
  user_messages_count integer not null default 0,
  duration_sec        integer not null default 0,
  credits             integer not null default 0,
  status              text not null default 'active',
  status_label        text not null default 'Chat activo',
  user_sentiment      text not null default 'Neutral',
  summary             text not null default '',
  extracted_data      jsonb not null default '{}'::jsonb,
  messages            jsonb not null default '[]'::jsonb,
  llm_model           text not null default 'gemini-2.5-flash',
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  ended_at            timestamptz
);

create index if not exists text_agent_conversations_user_agent_idx
  on public.text_agent_conversations (user_id, text_agent_id, created_at desc);

alter table public.text_agent_conversations enable row level security;

drop policy if exists "text_agent_conversations_select_own" on public.text_agent_conversations;
drop policy if exists "text_agent_conversations_insert_own" on public.text_agent_conversations;
drop policy if exists "text_agent_conversations_update_own" on public.text_agent_conversations;

create policy "text_agent_conversations_select_own" on public.text_agent_conversations
  for select using (auth.uid() = user_id);
create policy "text_agent_conversations_insert_own" on public.text_agent_conversations
  for insert with check (auth.uid() = user_id);
create policy "text_agent_conversations_update_own" on public.text_agent_conversations
  for update using (auth.uid() = user_id);

-- =============================================================================
-- Micrositio del corredor (uno por cuenta — link.noova360.com/[slug])
-- =============================================================================

create table if not exists public.broker_microsites (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references auth.users(id) on delete cascade,
  slug                text not null unique,
  company_context_id  uuid references public.company_contexts(id) on delete set null,
  text_agent_id       uuid references public.text_agents(id) on delete set null,
  accent_color        text not null default '#5b5bf6',
  button_color        text not null default '#5b5bf6',
  logo_url            text,
  favicon_url         text,
  agent_display_name  text,
  quick_actions       jsonb not null default '[]'::jsonb,
  is_published        boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists broker_microsites_slug_idx
  on public.broker_microsites (slug);

alter table public.broker_microsites enable row level security;

drop policy if exists "broker_microsites_select_own" on public.broker_microsites;
drop policy if exists "broker_microsites_insert_own" on public.broker_microsites;
drop policy if exists "broker_microsites_update_own" on public.broker_microsites;
drop policy if exists "broker_microsites_delete_own" on public.broker_microsites;

create policy "broker_microsites_select_own" on public.broker_microsites
  for select using (auth.uid() = user_id);
create policy "broker_microsites_insert_own" on public.broker_microsites
  for insert with check (auth.uid() = user_id);
create policy "broker_microsites_update_own" on public.broker_microsites
  for update using (auth.uid() = user_id);
create policy "broker_microsites_delete_own" on public.broker_microsites
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- Storage: assets del micrositio (logo, favicon)
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'microsite-assets',
  'microsite-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "microsite_assets_public_read" on storage.objects;
drop policy if exists "microsite_assets_service_insert" on storage.objects;
drop policy if exists "microsite_assets_service_delete" on storage.objects;

create policy "microsite_assets_public_read" on storage.objects
  for select using (bucket_id = 'microsite-assets');

create policy "microsite_assets_service_insert" on storage.objects
  for insert with check (bucket_id = 'microsite-assets');

create policy "microsite_assets_service_delete" on storage.objects
  for delete using (bucket_id = 'microsite-assets');

-- =============================================================================
-- Inbox: asignación humana y no leídos (016)
-- =============================================================================

alter table public.text_agent_conversations
  add column if not exists assigned_to text,
  add column if not exists handoff_mode text not null default 'ai',
  add column if not exists unread_count integer not null default 0;

create index if not exists text_agent_conversations_inbox_idx
  on public.text_agent_conversations (user_id, updated_at desc);

