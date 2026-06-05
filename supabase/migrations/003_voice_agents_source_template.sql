-- Plantilla de origen (solo referencia al preset en código), no es la fila global de plantilla
alter table public.voice_agents
  add column if not exists source_template text;

update public.voice_agents
set source_template = split_part(template_id, '::', 1)
where source_template is null;

update public.voice_agents
set source_template = 'lead-qualification'
where source_template is null or source_template = '';

alter table public.voice_agents
  alter column source_template set default 'lead-qualification';

comment on column public.voice_agents.source_template is
  'Preset usado al crear (lead-qualification, policy-reminder, follow-up). Las plantillas viven en la app, no en esta tabla.';
comment on table public.voice_agents is
  'Agentes de voz creados por cada usuario (multitenant). Una fila = un agente del cliente.';
