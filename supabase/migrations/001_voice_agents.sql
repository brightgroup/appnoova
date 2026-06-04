-- Agentes de voz por usuario (plantilla + personalización)
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
  updated_at    timestamptz not null default now(),
  unique (user_id, template_id)
);

create index if not exists voice_agents_user_id_idx on public.voice_agents(user_id);

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
