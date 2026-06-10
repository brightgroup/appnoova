-- Micrositio público del corredor (uno por cuenta, independiente de voice/text agents tables lógicamente)
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
