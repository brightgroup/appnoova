-- Reglas de agendamiento por agente (tools buscar_horarios_disponibles / crear_cita)

alter table public.text_agents
  add column if not exists scheduling_rules jsonb not null default '{}'::jsonb;

alter table public.voice_agents
  add column if not exists scheduling_rules jsonb not null default '{}'::jsonb;

comment on column public.text_agents.scheduling_rules is
  'Config de agendamiento: calendar_connection_id, event_duration_min, buffer_min, weekly_hours, min_notice_min, max_days_ahead, event_title_template.';

comment on column public.voice_agents.scheduling_rules is
  'Config de agendamiento: calendar_connection_id, event_duration_min, buffer_min, weekly_hours, min_notice_min, max_days_ahead, event_title_template.';
