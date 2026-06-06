-- Contextos de empresa / marca (reutilizables por agente de voz y Ori)
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

-- Cada agente de voz puede usar un contexto distinto (marca)
alter table public.voice_agents
  add column if not exists company_context_id uuid references public.company_contexts(id) on delete set null;

create index if not exists voice_agents_company_context_idx
  on public.voice_agents (company_context_id);
