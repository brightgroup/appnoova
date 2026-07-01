-- Campañas de voz outbound (audiencia + programación + mapeo)

create table if not exists public.campaign_audience_tables (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  description     text,
  columns         jsonb not null default '[]'::jsonb,
  row_count       int not null default 0,
  source_file_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists campaign_audience_tables_org_idx
  on public.campaign_audience_tables (organization_id, updated_at desc);

create table if not exists public.campaign_audience_rows (
  id                uuid primary key default gen_random_uuid(),
  audience_table_id uuid not null references public.campaign_audience_tables(id) on delete cascade,
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  data              jsonb not null default '{}'::jsonb,
  phone_e164        text,
  contact_name      text,
  scheduled_call_at timestamptz,
  call_status       text not null default 'pending'
    check (call_status in ('pending', 'calling', 'completed', 'failed', 'retry', 'skipped')),
  total_attempts    int not null default 0,
  last_attempt_at   timestamptz,
  sort_order        int not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists campaign_audience_rows_table_idx
  on public.campaign_audience_rows (audience_table_id, sort_order);

create index if not exists campaign_audience_rows_schedule_idx
  on public.campaign_audience_rows (audience_table_id, call_status, scheduled_call_at)
  where is_active = true and call_status in ('pending', 'retry');

create table if not exists public.voice_campaigns (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  goal              text,
  voice_agent_id    uuid references public.voice_agents(id) on delete set null,
  audience_table_id uuid references public.campaign_audience_tables(id) on delete set null,
  status            text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'completed')),
  wizard_step       int not null default 1 check (wizard_step between 1 and 4),
  schedule_config   jsonb not null default '{}'::jsonb,
  trigger_rule      jsonb not null default '{}'::jsonb,
  field_mapping     jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists voice_campaigns_org_idx
  on public.voice_campaigns (organization_id, updated_at desc);

create index if not exists voice_campaigns_status_idx
  on public.voice_campaigns (organization_id, status);

alter table public.campaign_audience_tables enable row level security;
alter table public.campaign_audience_rows enable row level security;
alter table public.voice_campaigns enable row level security;

drop policy if exists "campaign_audience_tables_own" on public.campaign_audience_tables;
create policy "campaign_audience_tables_own" on public.campaign_audience_tables
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "campaign_audience_rows_own" on public.campaign_audience_rows;
create policy "campaign_audience_rows_own" on public.campaign_audience_rows
  for all using (
    exists (
      select 1 from public.campaign_audience_tables t
      where t.id = audience_table_id and t.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.campaign_audience_tables t
      where t.id = audience_table_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "voice_campaigns_own" on public.voice_campaigns;
create policy "voice_campaigns_own" on public.voice_campaigns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
