-- Tablas de datos configurables (catálogos Excel → BD editable)
-- Usadas por agentes de texto/WhatsApp como fuente autorizada anti-alucinación

create table if not exists public.data_tables (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  description     text,
  columns         jsonb not null default '[]'::jsonb,
  row_count       int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists data_tables_org_idx
  on public.data_tables (organization_id, updated_at desc);

create table if not exists public.data_table_rows (
  id              uuid primary key default gen_random_uuid(),
  data_table_id   uuid not null references public.data_tables(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  data            jsonb not null default '{}'::jsonb,
  sort_order      int not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists data_table_rows_table_idx
  on public.data_table_rows (data_table_id, sort_order);

create index if not exists data_table_rows_data_gin
  on public.data_table_rows using gin (data);

alter table public.text_agents
  add column if not exists data_table_id uuid references public.data_tables(id) on delete set null;

create index if not exists text_agents_data_table_idx
  on public.text_agents (data_table_id);

alter table public.data_tables enable row level security;
alter table public.data_table_rows enable row level security;

drop policy if exists "data_tables_own" on public.data_tables;
create policy "data_tables_own" on public.data_tables
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "data_table_rows_own" on public.data_table_rows;
create policy "data_table_rows_own" on public.data_table_rows
  for all using (
    exists (
      select 1 from public.data_tables t
      where t.id = data_table_id and t.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.data_tables t
      where t.id = data_table_id and t.user_id = auth.uid()
    )
  );
