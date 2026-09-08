-- Conector real de Softseguros (S1/S2, confirmado 2026-09-05: tiene API REST
-- documentada en app.softseguros.com/docs/auth — auth Basic o Token vía
-- POST /api-token-auth/ con username/password). Mismo patrón que
-- hubspot_connections (100): una fila por organización, credenciales
-- cifradas a nivel de aplicación.

create table if not exists public.softseguros_connections (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  -- JSON cifrado: {"username": "...", "password": "..."}
  credentials_enc       text not null,
  status                text not null default 'pending' check (status in ('pending', 'active', 'disconnected', 'error')),
  last_error            text,
  last_synced_at        timestamptz,
  connected_by_user_id  uuid references auth.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint softseguros_connections_org_unique unique (organization_id)
);

create index if not exists softseguros_connections_org_idx
  on public.softseguros_connections (organization_id);

comment on table public.softseguros_connections is
  'Credenciales del corredor para la API de Softseguros (lectura de cartera/pólizas para renovaciones) — una por organización.';

alter table public.softseguros_connections enable row level security;

create policy softseguros_connections_member_select on public.softseguros_connections
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = softseguros_connections.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );
