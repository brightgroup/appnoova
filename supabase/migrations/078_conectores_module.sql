-- Módulo RBAC "conectores" (integraciones externas: Google Calendar, futuras)

insert into public.permission_modules (key, label, description, scope, sort_order)
values ('conectores', 'Conectores', 'Integraciones externas que dan capacidades a la IA (Google Calendar)', 'organization', 75)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  scope = excluded.scope,
  sort_order = excluded.sort_order;

-- Backfill aditivo para organizaciones y plantillas ya existentes (roles/organization_members
-- creados antes de que este módulo existiera no lo tienen en role_permissions).
-- Mismo criterio que el módulo "channels": owner/org_admin = manage, manager = edit,
-- advisor/viewer = view.
insert into public.role_permissions (role_id, module_key, level)
select r.id, 'conectores',
  case
    when r.slug in ('owner', 'org_admin') then 'manage'::public.permission_level
    when r.slug = 'manager' then 'edit'::public.permission_level
    when r.slug in ('advisor', 'viewer') then 'view'::public.permission_level
    else 'none'::public.permission_level
  end
from public.roles r
where r.scope = 'organization'
on conflict (role_id, module_key) do nothing;

-- Futuras organizaciones: incluir "conectores" en la misma categoría que "channels"
-- dentro de seed_organization_system_roles (manager = edit, advisor = view; owner/org_admin
-- ya heredan 'manage' porque iteran TODOS los módulos de scope organization).
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
      when key in ('voice_agents','text_agents','inbox','crm','channels','company_context','conectores') then 'edit'::public.permission_level
      when key in ('whatsapp','telephony','billing','org_users') then 'view'::public.permission_level
      else 'none'::public.permission_level
    end
  from public.permission_modules where scope = 'organization'
  on conflict (role_id, module_key) do update set level = excluded.level;

  insert into public.role_permissions (role_id, module_key, level)
  select r_advisor, key,
    case
      when key in ('inbox','crm') then 'edit'::public.permission_level
      when key in ('voice_agents','text_agents','channels','company_context','conectores') then 'view'::public.permission_level
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
