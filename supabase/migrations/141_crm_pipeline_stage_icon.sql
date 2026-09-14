-- Ícono personalizado por etapa del pipeline (2026-09-11, pedido del usuario:
-- rediseño de la vista de Leads con encabezado de etapas en la vista de
-- lista). Nullable — sin ícono asignado cae a un ícono genérico por defecto
-- en el frontend (ver resolveCrmStageIcon en src/lib/crm-stage-icons.ts).
alter table public.crm_pipeline_stages
  add column if not exists icon text;
