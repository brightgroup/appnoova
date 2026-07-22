-- Conector Google Calendar por organización (OAuth) — módulo de agendamiento

create table if not exists public.calendar_connections (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  provider            text not null default 'google' check (provider in ('google')),
  google_email        text,
  -- Tokens cifrados (AES-GCM, ver src/lib/crypto/token-cipher.ts) — nunca texto plano.
  access_token_enc    text not null,
  refresh_token_enc   text not null,
  token_expires_at    timestamptz,
  calendar_id         text not null default 'primary',
  scope               text,
  status              text not null default 'active' check (status in ('active', 'disconnected', 'error')),
  last_error          text,
  connected_by_user_id uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint calendar_connections_org_provider_unique unique (organization_id, provider)
);

create index if not exists calendar_connections_org_idx
  on public.calendar_connections (organization_id);

comment on table public.calendar_connections is
  'Conector de calendario externo por organización (primer proveedor: Google Calendar). Tokens cifrados a nivel de aplicación.';

alter table public.calendar_connections enable row level security;

-- Defensa en profundidad: el backend usa adminClient() (service role) en las
-- rutas API; estas policies cubren el caso de consulta con sesión de usuario.
create policy calendar_connections_member_select on public.calendar_connections
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = calendar_connections.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );
