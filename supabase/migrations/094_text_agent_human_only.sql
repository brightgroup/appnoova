-- Agente que nunca responde con IA: los mensajes quedan en cola humana
-- (inbox / WhatsApp / widget). Apagado por defecto para no cambiar
-- el comportamiento de ningún agente existente.

alter table public.text_agents
  add column if not exists human_only boolean not null default false;

comment on column public.text_agents.human_only is
  'Si es true, el agente no genera respuestas automáticas: solo atiende un humano desde el inbox.';
