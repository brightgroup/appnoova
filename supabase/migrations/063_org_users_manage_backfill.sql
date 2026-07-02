-- Asegurar que propietario y administrador de org puedan gestionar usuarios del equipo.

-- Plantilla org_admin: org_users = manage
update public.role_permissions
set level = 'manage'::public.permission_level
where role_id = '00000000-0000-4000-b000-000000000001'
  and module_key = 'org_users'
  and level is distinct from 'manage'::public.permission_level;

-- Roles por organización: owner y org_admin con org_users = manage
update public.role_permissions rp
set level = 'manage'::public.permission_level
from public.roles r
where rp.role_id = r.id
  and r.scope = 'organization'
  and r.organization_id is not null
  and r.slug in ('owner', 'org_admin')
  and rp.module_key = 'org_users'
  and rp.level is distinct from 'manage'::public.permission_level;

-- Insertar org_users manage si falta en owner/org_admin
insert into public.role_permissions (role_id, module_key, level)
select r.id, 'org_users', 'manage'::public.permission_level
from public.roles r
where r.scope = 'organization'
  and r.organization_id is not null
  and r.slug in ('owner', 'org_admin')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id and rp.module_key = 'org_users'
  )
on conflict (role_id, module_key) do update set level = excluded.level;

-- Propagar plantilla org_admin a todas las orgs
select public.sync_role_template_permissions('00000000-0000-4000-b000-000000000001');
