-- Horario de atención centralizado por organización (una sola vez, lo comparten todos los agentes)

alter table public.organizations
  add column if not exists business_hours jsonb not null default '{}'::jsonb;

comment on column public.organizations.business_hours is
  'Horario de atención estándar de la empresa para agendamiento: weekly_hours, min_notice_min, max_days_ahead. Compartido por todos los agentes de la organización.';
