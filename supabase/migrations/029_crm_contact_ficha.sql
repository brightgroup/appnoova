-- Ficha de contacto v2 (spec NOOVA360)

alter table public.crm_contacts
  add column if not exists tipo_contacto text not null default 'persona'
    check (tipo_contacto in ('persona', 'empresa'));

alter table public.crm_contacts
  add column if not exists documento_id text;

alter table public.crm_contacts
  add column if not exists organizacion text;

alter table public.crm_contacts
  add column if not exists whatsapp text;

alter table public.crm_contacts
  add column if not exists telefono text;

alter table public.crm_contacts
  add column if not exists canal_preferido text
    check (canal_preferido is null or canal_preferido in ('whatsapp', 'telefono', 'email'));

alter table public.crm_contacts
  add column if not exists estado_whatsapp text
    check (estado_whatsapp is null or estado_whatsapp in ('valido', 'invalido', 'rebotado'));

alter table public.crm_contacts
  add column if not exists estado_email text
    check (estado_email is null or estado_email in ('valido', 'invalido', 'rebotado'));

alter table public.crm_contacts
  add column if not exists ultimo_inbound_wa timestamptz;

alter table public.crm_contacts
  add column if not exists supresiones jsonb not null default '[]'::jsonb;

alter table public.crm_contacts
  add column if not exists autorizacion_datos boolean not null default false;

alter table public.crm_contacts
  add column if not exists autorizacion_datos_fecha timestamptz;

alter table public.crm_contacts
  add column if not exists autorizacion_datos_fuente text;

alter table public.crm_contacts
  add column if not exists fuente_origen text;

alter table public.crm_contacts
  add column if not exists categorias_interes jsonb not null default '[]'::jsonb;

alter table public.crm_contacts
  add column if not exists ciudad text;

alter table public.crm_contacts
  add column if not exists tipo_relacion text not null default 'prospecto'
    check (tipo_relacion in ('prospecto', 'cliente', 'referido', 'inactivo'));

alter table public.crm_contacts
  add column if not exists asesor_asignado uuid references auth.users(id) on delete set null;

alter table public.crm_contacts
  add column if not exists inbox_conversation_id uuid;

alter table public.crm_contacts
  add column if not exists field_provenance jsonb not null default '{}'::jsonb;

-- Migrar columnas legacy
update public.crm_contacts
set telefono = phone
where telefono is null and phone is not null;

update public.crm_contacts
set organizacion = company
where organizacion is null and company is not null;

update public.crm_contacts
set fuente_origen = source
where fuente_origen is null and source is not null;

update public.crm_contacts
set ciudad = metadata->>'ciudad'
where ciudad is null and metadata ? 'ciudad';

create index if not exists crm_contacts_whatsapp_idx
  on public.crm_contacts (user_id, whatsapp)
  where whatsapp is not null;

create unique index if not exists crm_contacts_user_whatsapp_unique
  on public.crm_contacts (user_id, whatsapp)
  where whatsapp is not null;

create index if not exists crm_contacts_documento_idx
  on public.crm_contacts (user_id, documento_id)
  where documento_id is not null;

-- Labels configurables por tenant
create table if not exists public.crm_tenant_label_config (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  campo_tecnico text not null,
  label_personalizado text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists crm_tenant_label_user_campo_idx
  on public.crm_tenant_label_config (user_id, campo_tecnico);

alter table public.crm_tenant_label_config enable row level security;

drop policy if exists "crm_tenant_labels_own" on public.crm_tenant_label_config;
create policy "crm_tenant_labels_own" on public.crm_tenant_label_config
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
