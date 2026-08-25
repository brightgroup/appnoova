-- Módulo RBAC "erp" (ERP: inventarios y futuros submódulos). Habilitado por
-- organización vía organizations.settings.modules.erp (ver src/lib/org-modules.ts) —
-- este módulo solo controla QUÉ puede hacer un usuario DENTRO de una organización
-- que ya tiene el flag encendido, no si la organización lo tiene o no.

insert into public.permission_modules (key, label, description, scope, sort_order)
values ('erp', 'ERP (inventarios)', 'Inventarios: maestro de productos, entradas/salidas y alertas de stock mínimo', 'organization', 77)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  scope = excluded.scope,
  sort_order = excluded.sort_order;

-- Backfill aditivo para organizaciones y plantillas ya existentes. No afecta la
-- visibilidad real del módulo (eso lo decide el flag por organización), pero deja
-- los niveles correctos ya listos para cuando se encienda: owner/org_admin = manage
-- (pueden ajustar existencias y configurar la alerta), manager/advisor = edit
-- (registran entradas/salidas), viewer = view (solo consulta).
insert into public.role_permissions (role_id, module_key, level)
select r.id, 'erp',
  case
    when r.slug in ('owner', 'org_admin') then 'manage'::public.permission_level
    when r.slug in ('manager', 'advisor') then 'edit'::public.permission_level
    when r.slug = 'viewer' then 'view'::public.permission_level
    else 'none'::public.permission_level
  end
from public.roles r
where r.scope = 'organization'
on conflict (role_id, module_key) do nothing;

-- Futuras organizaciones: incluir "erp" en seed_organization_system_roles con el
-- mismo criterio (manager/advisor = edit; owner/org_admin ya heredan 'manage'
-- porque iteran TODOS los módulos de scope organization; viewer cae en 'view' por
-- su rama por defecto, no necesita mención explícita).
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
      when key in ('voice_agents','text_agents','channels','company_context','conectores','workflows') then 'view'::public.permission_level
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
