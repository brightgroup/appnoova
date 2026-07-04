-- Tipificaciones técnicas de llamada en audiencia de campaña (separadas de disposición CRM).

alter table public.campaign_audience_rows
  drop constraint if exists campaign_audience_rows_call_status_check;

update public.campaign_audience_rows
  set call_status = 'connected'
  where call_status = 'completed';

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
    'skipped'
  ));
