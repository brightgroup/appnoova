-- Multi-tenant: organizaciones, roles, permisos por módulo y membresías
-- Compatible con public.users legacy (rol admin/user/agente)

-- ── Enums ───────────────────────────────────────────────────────────────────

do $$ begin
  create type public.account_status as enum ('active', 'invited', 'suspended', 'disabled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.permission_level as enum ('none', 'view', 'edit', 'manage');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.role_scope as enum ('platform', 'organization');
exception when duplicate_object then null;
end $$;

-- ── Organizaciones (cuentas / tenants) ──────────────────────────────────────

create table if not exists public.organizations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null,
  owner_user_id   uuid not null references auth.users(id) on delete restrict,
  status          public.account_status not null default 'active',
  plan            text not null default 'trial',
  settings        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint organizations_slug_unique unique (slug)
);

create index if not exists organizations_owner_idx on public.organizations (owner_user_id);
create index if not exists organizations_status_idx on public.organizations (status);

-- ── Perfiles (complementa auth.users; sincroniza con public.users legacy) ───

create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text not null,
  full_name           text,
  avatar_url          text,
  is_platform_admin   boolean not null default false,
  status              public.account_status not null default 'active',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists profiles_status_idx on public.profiles (status);

-- Extender public.users legacy si existe
do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'users'
  ) then
    alter table public.users add column if not exists status public.account_status default 'active';
    alter table public.users add column if not exists is_platform_admin boolean default false;
    alter table public.users add column if not exists full_name text;
    alter table public.users add column if not exists organization_id uuid references public.organizations(id);
  end if;
end $$;

-- ── Catálogo de módulos (permisos granulares) ───────────────────────────────

create table if not exists public.permission_modules (
  key           text primary key,
  label         text not null,
  description   text,
  scope         public.role_scope not null default 'organization',
  sort_order    int not null default 0,
  is_active     boolean not null default true
);

-- ── Roles (plataforma o por organización) ───────────────────────────────────

create table if not exists public.roles (
  id                uuid primary key default gen_random_uuid(),
  scope             public.role_scope not null,
  organization_id   uuid references public.organizations(id) on delete cascade,
  slug              text not null,
  name              text not null,
  description       text,
  is_system         boolean not null default false,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint roles_scope_org_check check (
    (scope = 'platform' and organization_id is null)
    or (scope = 'organization' and organization_id is not null)
  )
);

create unique index if not exists roles_platform_slug_idx
  on public.roles (slug) where scope = 'platform';

create unique index if not exists roles_org_slug_idx
  on public.roles (organization_id, slug) where scope = 'organization';

create index if not exists roles_org_idx on public.roles (organization_id);

-- ── Matriz rol → módulo → nivel ─────────────────────────────────────────────

create table if not exists public.role_permissions (
  role_id       uuid not null references public.roles(id) on delete cascade,
  module_key    text not null references public.permission_modules(key) on delete cascade,
  level         public.permission_level not null default 'none',
  primary key (role_id, module_key)
);

-- ── Membresía en organización ───────────────────────────────────────────────

create table if not exists public.organization_members (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  role_id           uuid not null references public.roles(id) on delete restrict,
  status            public.account_status not null default 'active',
  invited_by        uuid references auth.users(id),
  invited_at        timestamptz,
  joined_at         timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint organization_members_unique unique (organization_id, user_id)
);

create index if not exists organization_members_user_idx on public.organization_members (user_id);
create index if not exists organization_members_org_status_idx
  on public.organization_members (organization_id, status);

-- ── Rol activo de plataforma (superadmin / soporte) ─────────────────────────

create table if not exists public.platform_role_assignments (
  user_id       uuid not null references auth.users(id) on delete cascade,
  role_id       uuid not null references public.roles(id) on delete cascade,
  status        public.account_status not null default 'active',
  assigned_by   uuid references auth.users(id),
  assigned_at   timestamptz not null default now(),
  primary key (user_id, role_id)
);

-- ── Organización activa en sesión ───────────────────────────────────────────

create table if not exists public.user_active_organization (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  updated_at        timestamptz not null default now()
);

-- ── Invitaciones pendientes ─────────────────────────────────────────────────

create table if not exists public.organization_invites (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  email             text not null,
  role_id           uuid not null references public.roles(id) on delete restrict,
  invited_by        uuid not null references auth.users(id),
  token_hash        text not null,
  expires_at        timestamptz not null,
  accepted_at       timestamptz,
  created_at        timestamptz not null default now(),
  constraint organization_invites_org_email_unique unique (organization_id, email)
);

-- ── Seed: módulos de permiso ────────────────────────────────────────────────

insert into public.permission_modules (key, label, description, scope, sort_order) values
  ('voice_agents',   'Agentes de voz',     'Agentes IA de llamadas salientes/entrantes', 'organization', 10),
  ('text_agents',    'Agentes de texto',   'Agentes IA de chat y WhatsApp',              'organization', 20),
  ('inbox',          'Inbox',              'Conversaciones y respuesta humana',          'organization', 30),
  ('crm',            'CRM',                'Contactos, leads y pipeline',                'organization', 40),
  ('campaigns',      'Campañas',           'Campañas outbound (futuro)',               'organization', 50),
  ('flow_studio',    'Flow Studio',        'Automatizaciones visuales (futuro)',         'organization', 60),
  ('channels',       'Canales',            'Mi Link, widget, micrositio',                'organization', 70),
  ('whatsapp',       'WhatsApp',           'Líneas y plantillas WhatsApp',               'organization', 80),
  ('telephony',      'Telefonía',          'Números y líneas telefónicas',              'organization', 90),
  ('billing',        'Facturación',        'Plan, créditos y pagos',                   'organization', 100),
  ('company_context','Contextos de marca', 'Conocimiento y contexto ORI',              'organization', 110),
  ('org_users',      'Usuarios org',       'Miembros y roles de la organización',        'organization', 120),
  ('platform_users', 'Usuarios plataforma','Gestión global de cuentas (superadmin)',   'platform',     10),
  ('platform_orgs',  'Organizaciones',     'Crear, activar y suspender tenants',       'platform',     20),
  ('platform_roles', 'Roles plataforma',   'Roles y permisos globales',                'platform',     30)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  scope = excluded.scope,
  sort_order = excluded.sort_order;

-- ── Seed: roles de sistema (plataforma) ───────────────────────────────────────

insert into public.roles (id, scope, organization_id, slug, name, description, is_system, is_active)
values
  ('00000000-0000-4000-a000-000000000001', 'platform', null, 'super_admin', 'Super administrador',
   'Acceso total a la plataforma', true, true),
  ('00000000-0000-4000-a000-000000000002', 'platform', null, 'platform_support', 'Soporte plataforma',
   'Ver organizaciones y usuarios; acciones limitadas', true, true)
on conflict (id) do nothing;
insert into public.role_permissions (role_id, module_key, level)
select '00000000-0000-4000-a000-000000000001', key,
  case when key like 'platform_%' then 'manage'::public.permission_level else 'none'::public.permission_level end
from public.permission_modules
where scope = 'platform'
on conflict do nothing;

insert into public.role_permissions (role_id, module_key, level)
select '00000000-0000-4000-a000-000000000002', key, 'view'::public.permission_level
from public.permission_modules
where scope = 'platform'
on conflict do nothing;

-- ── Función: crear roles de sistema para una organización ───────────────────

create or replace function public.seed_organization_system_roles(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r_owner uuid;
  r_admin uuid;
  r_manager uuid;
  r_advisor uuid;
  r_viewer uuid;
begin
  insert into public.roles (scope, organization_id, slug, name, description, is_system)
  values ('organization', p_org_id, 'owner', 'Propietario', 'Control total de la organización', true)
  on conflict do nothing;

  insert into public.roles (scope, organization_id, slug, name, description, is_system)
  values ('organization', p_org_id, 'org_admin', 'Administrador', 'Administra usuarios, canales y CRM', true)
  on conflict do nothing;

  insert into public.roles (scope, organization_id, slug, name, description, is_system)
  values ('organization', p_org_id, 'manager', 'Gerente', 'Opera inbox, CRM y agentes', true)
  on conflict do nothing;

  insert into public.roles (scope, organization_id, slug, name, description, is_system)
  values ('organization', p_org_id, 'advisor', 'Asesor', 'Atiende conversaciones y oportunidades', true)
  on conflict do nothing;

  insert into public.roles (scope, organization_id, slug, name, description, is_system)
  values ('organization', p_org_id, 'viewer', 'Solo lectura', 'Consulta sin editar', true)
  on conflict do nothing;

  select id into r_owner from public.roles where organization_id = p_org_id and slug = 'owner';
  select id into r_admin from public.roles where organization_id = p_org_id and slug = 'org_admin';
  select id into r_manager from public.roles where organization_id = p_org_id and slug = 'manager';
  select id into r_advisor from public.roles where organization_id = p_org_id and slug = 'advisor';
  select id into r_viewer from public.roles where organization_id = p_org_id and slug = 'viewer';

  insert into public.role_permissions (role_id, module_key, level)
  select r_owner, key, 'manage'::public.permission_level
  from public.permission_modules where scope = 'organization'
  on conflict (role_id, module_key) do update set level = excluded.level;

  insert into public.role_permissions (role_id, module_key, level)
  select r_admin, key,
    case when key = 'billing' then 'edit'::public.permission_level else 'manage'::public.permission_level end
  from public.permission_modules where scope = 'organization'
  on conflict (role_id, module_key) do update set level = excluded.level;

  insert into public.role_permissions (role_id, module_key, level)
  select r_manager, key,
    case
      when key in ('voice_agents','text_agents','inbox','crm','channels','company_context') then 'edit'::public.permission_level
      when key in ('whatsapp','telephony','billing','org_users') then 'view'::public.permission_level
      else 'none'::public.permission_level
    end
  from public.permission_modules where scope = 'organization'
  on conflict (role_id, module_key) do update set level = excluded.level;

  insert into public.role_permissions (role_id, module_key, level)
  select r_advisor, key,
    case
      when key in ('inbox','crm') then 'edit'::public.permission_level
      when key in ('voice_agents','text_agents','channels','company_context') then 'view'::public.permission_level
      else 'none'::public.permission_level
    end
  from public.permission_modules where scope = 'organization'
  on conflict (role_id, module_key) do update set level = excluded.level;

  insert into public.role_permissions (role_id, module_key, level)
  select r_viewer, key,
    case
      when key in ('campaigns','flow_studio','billing','org_users') then 'none'::public.permission_level
      else 'view'::public.permission_level
    end
  from public.permission_modules where scope = 'organization'
  on conflict (role_id, module_key) do update set level = excluded.level;
end;
$$;

-- ── Helpers de permisos ─────────────────────────────────────────────────────

create or replace function public.permission_level_rank(p_level public.permission_level)
returns int
language sql
immutable
as $$
  select case p_level
    when 'none' then 0
    when 'view' then 1
    when 'edit' then 2
    when 'manage' then 3
  end;
$$;

create or replace function public.user_org_permission_level(
  p_user_id uuid,
  p_organization_id uuid,
  p_module_key text
)
returns public.permission_level
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select rp.level
      from public.organization_members om
      join public.role_permissions rp on rp.role_id = om.role_id
      where om.user_id = p_user_id
        and om.organization_id = p_organization_id
        and om.status = 'active'
        and rp.module_key = p_module_key
      order by public.permission_level_rank(rp.level) desc
      limit 1
    ),
    'none'::public.permission_level
  );
$$;

create or replace function public.is_platform_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_platform_admin from public.profiles where id = p_user_id),
    false
  )
  or exists (
    select 1
    from public.platform_role_assignments pra
    join public.roles r on r.id = pra.role_id
    where pra.user_id = p_user_id
      and pra.status = 'active'
      and r.slug = 'super_admin'
      and r.scope = 'platform'
  )
  or exists (
    select 1 from public.users u
    where u.id = p_user_id and u.rol = 'admin'
  );
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.organization_members enable row level security;
alter table public.platform_role_assignments enable row level security;
alter table public.user_active_organization enable row level security;
alter table public.organization_invites enable row level security;
alter table public.permission_modules enable row level security;

-- permission_modules: lectura autenticada
drop policy if exists permission_modules_read on public.permission_modules;
create policy permission_modules_read on public.permission_modules
  for select to authenticated using (true);

-- profiles: ver propio perfil; platform admin ve todos
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_platform_admin(auth.uid()));

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- organizations: miembros ven su org; platform admin ve todas
drop policy if exists organizations_member_select on public.organizations;
create policy organizations_member_select on public.organizations
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = organizations.id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );

-- organization_members
drop policy if exists org_members_select on public.organization_members;
create policy org_members_select on public.organization_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = organization_members.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and public.permission_level_rank(
          public.user_org_permission_level(auth.uid(), om.organization_id, 'org_users')
        ) >= public.permission_level_rank('view'::public.permission_level)
    )
  );

-- roles: ver roles de plataforma o de orgs donde soy miembro
drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles
  for select to authenticated
  using (
    scope = 'platform'
    or public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = roles.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );

-- role_permissions: mismo criterio que roles
drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and (
          r.scope = 'platform'
          or public.is_platform_admin(auth.uid())
          or exists (
            select 1 from public.organization_members om
            where om.organization_id = r.organization_id
              and om.user_id = auth.uid()
              and om.status = 'active'
          )
        )
    )
  );

-- user_active_organization
drop policy if exists user_active_org_self on public.user_active_organization;
create policy user_active_org_self on public.user_active_organization
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
