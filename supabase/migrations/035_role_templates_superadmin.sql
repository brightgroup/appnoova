-- Plantillas de roles de organización configurables + superadmin protegido

-- ── Roles: permitir plantillas globales (organization_id NULL) ──────────────

alter table public.roles drop constraint if exists roles_scope_org_check;
alter table public.roles add constraint roles_scope_org_check check (
  (scope = 'platform' and organization_id is null)
  or (scope = 'organization')
);

alter table public.roles add column if not exists is_template boolean not null default false;

create unique index if not exists roles_template_slug_idx
  on public.roles (slug) where is_template = true;

-- ── Perfil protegido (superadmin principal, no suspendible) ─────────────────

alter table public.profiles add column if not exists is_protected boolean not null default false;

update public.profiles
set
  is_protected = true,
  is_platform_admin = true,
  status = 'active'::public.account_status
where lower(trim(email)) = 'admin@noova360.com';

do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'users') then
    update public.users
    set is_platform_admin = true, rol = 'admin', status = 'active'::public.account_status
    where lower(trim(email)) = 'admin@noova360.com';

    update public.users
    set rol = 'user', is_platform_admin = false
    where lower(trim(email)) <> 'admin@noova360.com' and rol = 'admin';

    update public.profiles
    set is_platform_admin = false
    where lower(trim(email)) <> 'admin@noova360.com';
  end if;
end $$;

-- Solo el superadmin protegido conserva rol de plataforma
delete from public.platform_role_assignments pra
where not exists (
  select 1 from public.profiles p
  where p.id = pra.user_id and p.is_protected = true
);

insert into public.platform_role_assignments (user_id, role_id, status)
select p.id, '00000000-0000-4000-a000-000000000001'::uuid, 'active'::public.account_status
from public.profiles p
where p.is_protected = true
on conflict do nothing;

-- ── Plantillas de roles de organización (configurables en /admin/roles) ─────

insert into public.roles (id, scope, organization_id, slug, name, description, is_system, is_template, is_active)
values
  ('00000000-0000-4000-b000-000000000001', 'organization', null, 'org_admin',
   'Administrador de organización',
   'Empresa suscriptora: acceso total al dashboard, sin panel /admin', true, true, true),
  ('00000000-0000-4000-b000-000000000002', 'organization', null, 'manager',
   'Gerente', 'Opera inbox, CRM y agentes', true, true, true),
  ('00000000-0000-4000-b000-000000000003', 'organization', null, 'advisor',
   'Asesor', 'Atiende conversaciones y oportunidades', true, true, true),
  ('00000000-0000-4000-b000-000000000004', 'organization', null, 'viewer',
   'Solo lectura', 'Consulta sin editar', true, true, true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  is_template = true,
  is_system = excluded.is_system;

-- Permisos plantilla org_admin: manage en todos los módulos de org
insert into public.role_permissions (role_id, module_key, level)
select '00000000-0000-4000-b000-000000000001', key, 'manage'::public.permission_level
from public.permission_modules where scope = 'organization'
on conflict (role_id, module_key) do update set level = excluded.level;

-- manager
insert into public.role_permissions (role_id, module_key, level)
select '00000000-0000-4000-b000-000000000002', key,
  case
    when key in ('voice_agents','text_agents','inbox','crm','channels','company_context') then 'edit'::public.permission_level
    when key in ('whatsapp','telephony','billing','org_users') then 'view'::public.permission_level
    else 'none'::public.permission_level
  end
from public.permission_modules where scope = 'organization'
on conflict (role_id, module_key) do update set level = excluded.level;

-- advisor
insert into public.role_permissions (role_id, module_key, level)
select '00000000-0000-4000-b000-000000000003', key,
  case
    when key in ('inbox','crm') then 'edit'::public.permission_level
    when key in ('voice_agents','text_agents','channels','company_context') then 'view'::public.permission_level
    else 'none'::public.permission_level
  end
from public.permission_modules where scope = 'organization'
on conflict (role_id, module_key) do update set level = excluded.level;

-- viewer
insert into public.role_permissions (role_id, module_key, level)
select '00000000-0000-4000-b000-000000000004', key,
  case
    when key in ('campaigns','flow_studio','billing','org_users') then 'none'::public.permission_level
    else 'view'::public.permission_level
  end
from public.permission_modules where scope = 'organization'
on conflict (role_id, module_key) do update set level = excluded.level;

-- Propagar plantillas → roles existentes por organización
create or replace function public.sync_role_template_permissions(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
begin
  select slug into v_slug
  from public.roles
  where id = p_template_id and is_template = true;

  if v_slug is null then
    return;
  end if;

  delete from public.role_permissions rp
  using public.roles r
  where rp.role_id = r.id
    and r.scope = 'organization'
    and r.organization_id is not null
    and r.slug = v_slug
    and r.is_template = false;

  insert into public.role_permissions (role_id, module_key, level)
  select r.id, tp.module_key, tp.level
  from public.roles r
  cross join public.role_permissions tp
  where tp.role_id = p_template_id
    and r.scope = 'organization'
    and r.organization_id is not null
    and r.slug = v_slug
    and r.is_template = false
  on conflict (role_id, module_key) do update set level = excluded.level;
end;
$$;

select public.sync_role_template_permissions(id)
from public.roles
where is_template = true;

-- ── is_super_admin: único acceso a /admin ───────────────────────────────────

create or replace function public.is_super_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_protected from public.profiles p where p.id = p_user_id),
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
  );
$$;

create or replace function public.is_platform_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin(p_user_id);
$$;

create or replace function public.is_protected_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_protected from public.profiles p where p.id = p_user_id),
    false
  );
$$;
