-- Registro detallado de llamadas por agente de voz (multitenant)
create table if not exists public.voice_agent_calls (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  voice_agent_id      uuid not null references public.voice_agents(id) on delete cascade,
  phone_number        text not null default 'Prueba web',
  duration_sec        integer not null default 0,
  credits             integer not null default 0,
  status              text not null default 'ended_success',
  status_label        text not null default 'Ended - Llamada exitosa',
  in_voicemail        boolean not null default false,
  disconnect_reason   text not null default 'Agent Hangup',
  user_sentiment      text not null default 'Neutral',
  summary             text not null default '',
  extracted_data      jsonb not null default '{}'::jsonb,
  dynamic_variables   jsonb not null default '{}'::jsonb,
  transcript          jsonb not null default '[]'::jsonb,
  audio_url           text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists voice_agent_calls_user_agent_idx
  on public.voice_agent_calls (user_id, voice_agent_id, created_at desc);

alter table public.voice_agent_calls enable row level security;

drop policy if exists "voice_agent_calls_select_own" on public.voice_agent_calls;
drop policy if exists "voice_agent_calls_insert_own" on public.voice_agent_calls;

create policy "voice_agent_calls_select_own" on public.voice_agent_calls
  for select using (auth.uid() = user_id);
create policy "voice_agent_calls_insert_own" on public.voice_agent_calls
  for insert with check (auth.uid() = user_id);
