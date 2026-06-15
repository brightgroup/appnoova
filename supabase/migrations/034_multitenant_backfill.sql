-- Backfill: perfiles, organizaciones y membresías desde usuarios legacy

-- ── Sincronizar profiles desde auth.users + public.users ────────────────────

insert into public.profiles (id, email, full_name, is_platform_admin, status)
select
  au.id,
  coalesce(au.email, u.email, ''),
  coalesce(u.nombre, u.full_name, split_part(coalesce(au.email, ''), '@', 1)),
  coalesce(u.is_platform_admin, u.rol = 'admin', false),
  coalesce(u.status, 'active'::public.account_status)
from auth.users au
left join public.users u on u.id = au.id
on conflict (id) do update set
  email = excluded.email,
  full_name = coalesce(excluded.full_name, public.profiles.full_name),
  is_platform_admin = excluded.is_platform_admin or public.profiles.is_platform_admin,
  status = excluded.status,
  updated_at = now();

-- Superadmins legacy → rol plataforma
insert into public.platform_role_assignments (user_id, role_id, status)
select p.id, '00000000-0000-4000-a000-000000000001'::uuid, 'active'::public.account_status
from public.profiles p
where p.is_platform_admin = true
on conflict do nothing;

-- ── Una organización por cuenta legacy (owner = user_id actual) ─────────────

insert into public.organizations (name, slug, owner_user_id, status)
select
  coalesce(nullif(trim(u.nombre), ''), split_part(coalesce(u.email, au.email, 'cuenta'), '@', 1)) || ' — Org',
  'org-' || substr(replace(au.id::text, '-', ''), 1, 12),
  au.id,
  coalesce(u.status, 'active'::public.account_status)
from auth.users au
left join public.users u on u.id = au.id
where not exists (
  select 1 from public.organizations o where o.owner_user_id = au.id
);

-- Roles de sistema por org nueva
do $$
declare
  org record;
begin
  for org in select id from public.organizations loop
    perform public.seed_organization_system_roles(org.id);
  end loop;
end $$;

-- Membresía owner
insert into public.organization_members (organization_id, user_id, role_id, status, joined_at)
select
  o.id,
  o.owner_user_id,
  r.id,
  'active'::public.account_status,
  o.created_at
from public.organizations o
join public.roles r on r.organization_id = o.id and r.slug = 'owner'
where not exists (
  select 1 from public.organization_members om
  where om.organization_id = o.id and om.user_id = o.owner_user_id
);

-- Organización activa por defecto
insert into public.user_active_organization (user_id, organization_id)
select om.user_id, om.organization_id
from public.organization_members om
join public.roles r on r.id = om.role_id and r.slug = 'owner'
where not exists (
  select 1 from public.user_active_organization uao where uao.user_id = om.user_id
);

-- Vincular users.organization_id legacy
update public.users u
set organization_id = o.id
from public.organizations o
where o.owner_user_id = u.id
  and u.organization_id is null;
