-- Definiciones de propiedades personalizadas por inquilino (contactos y leads)

create table if not exists public.crm_property_definitions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  entity_type  text not null check (entity_type in ('contact', 'lead')),
  field_key    text not null,
  label        text not null,
  field_type   text not null default 'text'
    check (field_type in ('text', 'number', 'date', 'select', 'phone', 'email', 'url', 'boolean', 'textarea')),
  options      jsonb not null default '[]'::jsonb,
  is_builtin   boolean not null default false,
  is_required  boolean not null default false,
  sort_order   int not null default 0,
  group_name   text not null default 'Personalizado',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists crm_property_defs_user_entity_key_idx
  on public.crm_property_definitions (user_id, entity_type, field_key);

create index if not exists crm_property_defs_user_entity_order_idx
  on public.crm_property_definitions (user_id, entity_type, sort_order);

alter table public.crm_property_definitions enable row level security;

drop policy if exists "crm_property_defs_own" on public.crm_property_definitions;
create policy "crm_property_defs_own" on public.crm_property_definitions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
