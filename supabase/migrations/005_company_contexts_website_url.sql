alter table public.company_contexts
  add column if not exists website_url text not null default '';
