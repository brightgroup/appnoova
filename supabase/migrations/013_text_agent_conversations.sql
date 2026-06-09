-- Registro de conversaciones de chat por agente de texto (independiente de voice_agent_calls)
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
