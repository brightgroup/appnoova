-- Extracción de los 26 formularios reales de Figuro (competidor) para armar
-- las preguntas de cotización de 20 ramos nuevos (ver docs/HANDOFF-CAMPOS-COTIZACION-CONFIGURABLES.md
-- y la conversación que lo extendió) — necesita 4 ramos que no existían en el
-- catálogo (sembrado desde Softseguros, que no los modela) y un tipo de campo
-- nuevo para preguntas de "elige todas las que apliquen" (ej. naturaleza del
-- riesgo en transporte de mercancías).
insert into public.ramos_catalogo (nombre, slug) values
  ('BICICLETA', 'bicicleta'),
  ('PLAN DENTAL', 'dental'),
  ('CIBERRIESGOS', 'ciberriesgos'),
  ('SEPELIO', 'sepelio')
on conflict (slug) do nothing;

alter table public.poliza_ramo_campos drop constraint if exists poliza_ramo_campos_field_type_check;
alter table public.poliza_ramo_campos add constraint poliza_ramo_campos_field_type_check
  check (field_type in ('text', 'number', 'date', 'select', 'boolean', 'multiselect'));

comment on column public.poliza_ramo_campos.field_type is
  'multiselect = "elige todas las que apliquen" (ej. naturaleza del riesgo en transporte de mercancías) — siempre se presenta en texto (guided-questions.ts), WhatsApp no tiene botones/lista de selección múltiple.';
