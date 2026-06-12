-- Widget web embebible (independiente de Mi Link; uno por usuario)
create table if not exists public.broker_web_widgets (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references auth.users(id) on delete cascade,
  slug                text not null unique,
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

create unique index if not exists broker_web_widgets_slug_unique_idx
  on public.broker_web_widgets (slug);

alter table public.broker_web_widgets enable row level security;

drop policy if exists "broker_web_widgets_select_own" on public.broker_web_widgets;
drop policy if exists "broker_web_widgets_insert_own" on public.broker_web_widgets;
drop policy if exists "broker_web_widgets_update_own" on public.broker_web_widgets;
drop policy if exists "broker_web_widgets_delete_own" on public.broker_web_widgets;

create policy "broker_web_widgets_select_own" on public.broker_web_widgets
  for select using (auth.uid() = user_id);

create policy "broker_web_widgets_insert_own" on public.broker_web_widgets
  for insert with check (auth.uid() = user_id);

create policy "broker_web_widgets_update_own" on public.broker_web_widgets
  for update using (auth.uid() = user_id);

create policy "broker_web_widgets_delete_own" on public.broker_web_widgets
  for delete using (auth.uid() = user_id);
