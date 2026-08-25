-- Por defecto, el rol Asesor no debe ver ni operar Workflows ni Conectores —
-- son herramientas de automatización/integración, no de atención al cliente,
-- que es lo que hace un asesor. Sigue siendo configurable por organización
-- desde /admin/roles (plantilla) si algún cliente puntual sí lo necesita —
-- esto solo cambia el valor por defecto, no elimina el módulo de la lista.

-- Plantilla global "Asesor" (035_role_templates_superadmin.sql)
update public.role_permissions
set level = 'none'::public.permission_level
where role_id = '00000000-0000-4000-b000-000000000003'
  and module_key in ('conectores', 'workflows');

-- Propaga el nuevo default a los roles "Asesor" ya existentes de cada
-- organización (mismo mecanismo que usa /admin/roles al guardar una plantilla).
select public.sync_role_template_permissions('00000000-0000-4000-b000-000000000003'::uuid);

-- Futuras organizaciones: el asesor deja de heredar 'view' en conectores/workflows.
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
      when key in ('voice_agents','text_agents','inbox','crm','channels','company_context','conectores','workflows','erp') then 'edit'::public.permission_level
      when key in ('whatsapp','telephony','billing','org_users') then 'view'::public.permission_level
      else 'none'::public.permission_level
    end
  from public.permission_modules where scope = 'organization'
  on conflict (role_id, module_key) do update set level = excluded.level;

  insert into public.role_permissions (role_id, module_key, level)
  select r_advisor, key,
    case
      when key in ('inbox','crm','erp') then 'edit'::public.permission_level
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
