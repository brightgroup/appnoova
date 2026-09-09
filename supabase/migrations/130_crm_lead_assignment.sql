-- Visibilidad de leads estilo HubSpot para organizaciones con varios asesores
-- (arranca con Noova Seguros, pero es genérico): el dueño/admin (nivel
-- `manage` en el módulo `crm`, ver 033_multitenant_rbac.sql) sigue viendo y
-- administrando todos los leads de la organización; un asesor (nivel `edit`,
-- rol "advisor") solo ve/gestiona los que tiene asignados explícitamente.
-- Aditivo: nullable, sin dato = sigue comportándose como hoy para el dueño.
alter table public.crm_leads
  add column if not exists assigned_user_id uuid references auth.users(id) on delete set null;

create index if not exists crm_leads_assigned_user_idx on public.crm_leads (assigned_user_id);

comment on column public.crm_leads.assigned_user_id is
  'Asesor responsable de trabajar este lead. NULL = sin asignar (solo lo ve quien tiene nivel manage en el módulo crm). El control de acceso real vive en la capa de API (src/lib/crm-auth.ts), no en RLS — las rutas de CRM usan el cliente admin.';
