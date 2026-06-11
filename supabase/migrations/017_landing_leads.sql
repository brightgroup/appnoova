-- Solicitudes desde la landing (leads públicos, sin auth)
create table if not exists public.landing_leads (
  id              uuid primary key default gen_random_uuid(),
  source          text not null,
  plan_interest   text,
  company_name    text not null,
  contact_name    text not null,
  email           text not null,
  phone           text,
  company_size    text not null,
  message         text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists landing_leads_created_at_idx
  on public.landing_leads (created_at desc);

create index if not exists landing_leads_company_size_idx
  on public.landing_leads (company_size, created_at desc);

alter table public.landing_leads enable row level security;

-- Sin políticas públicas: lectura/escritura vía service role en API route.
