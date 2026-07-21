-- Reglas de notificación al equipo (tool notify_team) por agente de texto
alter table public.text_agents
  add column if not exists notify_rules jsonb not null default '{}'::jsonb;

comment on column public.text_agents.notify_rules is
  'Reglas por evento (appointment_booked, purchase_intent): email/push/whatsapp y destinos E.164';
