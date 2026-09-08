-- Vault de credenciales de aseguradora por organización — Noova Seguros,
-- módulo "seguros" (111_seguros_module.sql). Mismo patrón que
-- calendar_connections (075) / hubspot_connections (100): una fila por
-- organización y proveedor, secreto cifrado a nivel de aplicación
-- (AES-256-GCM, ver src/lib/crypto/token-cipher.ts), RLS de solo lectura
-- para miembros activos (el backend real usa adminClient(), service role).
--
-- Cada aseguradora exige campos de credenciales distintos (usuario/contraseña
-- para La Equidad; partnerid/agentid/partnercode para Allianz; etc.) — en vez
-- de una tabla por aseguradora, `credentials_enc` guarda un JSON cifrado con
-- las llaves que ese `provider_key` necesite. La forma exacta la define el
-- adaptador de cada aseguradora en src/lib/insurers/, no el esquema de BD.
--
-- Las credenciales son SIEMPRE del corredor (organización cliente), nunca de
-- Noova — Noova actúa como proveedor de tecnología autorizado por el
-- corredor, que ya tiene convenio propio con esa aseguradora.

create table if not exists public.insurer_connections (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  -- Ampliar este CHECK en una migración nueva por cada aseguradora que se sume.
  provider_key          text not null check (provider_key in ('la_equidad')),
  display_name          text not null,
  -- JSON cifrado: {"usuario": "...", "contrasena": "..."} para La Equidad, etc.
  credentials_enc       text not null,
  status                text not null default 'pending' check (status in ('pending', 'active', 'disconnected', 'error')),
  last_error            text,
  last_tested_at        timestamptz,
  connected_by_user_id  uuid references auth.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint insurer_connections_org_provider_unique unique (organization_id, provider_key)
);

create index if not exists insurer_connections_org_idx
  on public.insurer_connections (organization_id);

comment on table public.insurer_connections is
  'Credenciales del corredor por aseguradora (vault cifrado), una fila por organización+aseguradora. Noova llama el web service en nombre del corredor.';

alter table public.insurer_connections enable row level security;

create policy insurer_connections_member_select on public.insurer_connections
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = insurer_connections.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );
