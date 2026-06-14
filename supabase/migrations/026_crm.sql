-- CRM: contactos y leads con pipeline configurable por inquilino

create table if not exists public.crm_pipeline_stages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  slug        text not null,
  color       text not null default '#5b5bf6',
  sort_order  int not null default 0,
  is_won      boolean not null default false,
  is_lost     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists crm_pipeline_stages_user_slug_idx
  on public.crm_pipeline_stages (user_id, slug);

create index if not exists crm_pipeline_stages_user_order_idx
  on public.crm_pipeline_stages (user_id, sort_order);

create table if not exists public.crm_contacts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  email       text,
  phone       text,
  company     text,
  job_title   text,
  source      text,
  notes       text,
  tags        jsonb not null default '[]'::jsonb,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists crm_contacts_user_idx
  on public.crm_contacts (user_id, updated_at desc);

create index if not exists crm_contacts_phone_idx
  on public.crm_contacts (user_id, phone)
  where phone is not null;

create table if not exists public.crm_leads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  contact_id  uuid references public.crm_contacts(id) on delete set null,
  stage_id    uuid not null references public.crm_pipeline_stages(id) on delete restrict,
  title       text not null,
  value_amount numeric(14,2),
  currency    text not null default 'COP',
  source      text,
  notes       text,
  sort_order  int not null default 0,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists crm_leads_user_stage_idx
  on public.crm_leads (user_id, stage_id, sort_order);

alter table public.crm_pipeline_stages enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_leads enable row level security;

drop policy if exists "crm_stages_own" on public.crm_pipeline_stages;
create policy "crm_stages_own" on public.crm_pipeline_stages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "crm_contacts_own" on public.crm_contacts;
create policy "crm_contacts_own" on public.crm_contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "crm_leads_own" on public.crm_leads;
create policy "crm_leads_own" on public.crm_leads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
