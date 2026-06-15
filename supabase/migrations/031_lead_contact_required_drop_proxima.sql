-- Lead: contacto obligatorio; quitar campos manuales de próxima acción

delete from public.crm_leads where contact_id is null;

drop index if exists crm_leads_user_proxima_idx;

alter table public.crm_leads
  drop column if exists proxima_accion,
  drop column if exists proxima_accion_fecha,
  drop column if exists proxima_accion_tipo,
  drop column if exists proxima_accion_estado;

alter table public.crm_leads
  alter column contact_id set not null;
