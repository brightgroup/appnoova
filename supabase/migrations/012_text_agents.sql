-- Agentes de texto (chat) — multitenant por user_id
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
