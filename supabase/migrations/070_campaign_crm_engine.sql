-- Módulo de campañas con alimentación CRM:
-- tipo de campaña, campos de salida personalizables, inscripción de contactos CRM
-- y resultados capturados por IA por prospecto.

-- 1) Campaña: tipo, campos de salida y configuración CRM
alter table public.voice_campaigns
  add column if not exists campaign_type text not null default 'prospeccion'
    check (campaign_type in ('prospeccion', 'seguimiento', 'encuesta', 'notificacion'));

alter table public.voice_campaigns
  add column if not exists output_fields jsonb not null default '[]'::jsonb;

alter table public.voice_campaigns
  add column if not exists crm_config jsonb not null default '{}'::jsonb;

-- 2) Audiencia: vínculo con CRM y resultados capturados por la IA
alter table public.campaign_audience_rows
  add column if not exists crm_contact_id uuid references public.crm_contacts(id) on delete set null;

alter table public.campaign_audience_rows
  add column if not exists crm_lead_id uuid references public.crm_leads(id) on delete set null;

alter table public.campaign_audience_rows
  add column if not exists results jsonb not null default '{}'::jsonb;

alter table public.campaign_audience_rows
  add column if not exists results_meta jsonb not null default '{}'::jsonb;

alter table public.campaign_audience_rows
  add column if not exists result_primary text;

alter table public.campaign_audience_rows
  add column if not exists excluded_reason text;

-- 3) Estado técnico: número inválido (no se reintenta)
alter table public.campaign_audience_rows
  drop constraint if exists campaign_audience_rows_call_status_check;

alter table public.campaign_audience_rows
  add constraint campaign_audience_rows_call_status_check
  check (call_status in (
    'pending',
    'calling',
    'retry',
    'connected',
    'voicemail',
    'no_answer',
    'busy',
    'rejected',
    'failed',
    'invalid',
    'skipped'
  ));

create index if not exists campaign_audience_rows_crm_contact_idx
  on public.campaign_audience_rows (crm_contact_id)
  where crm_contact_id is not null;
