-- Criterios configurables por etapa para que la IA mueva leads en el pipeline

alter table public.crm_pipeline_stages
  add column if not exists ai_enter_criteria text;

update public.crm_pipeline_stages
set ai_enter_criteria = case slug
  when 'nuevo' then 'Lead recién creado o primer mensaje del prospecto sin respuesta del asesor o IA.'
  when 'contacto_inicial' then 'Lead recién creado o primer mensaje del prospecto sin respuesta del asesor o IA.'
  when 'contactado' then 'Hay diálogo activo: el asesor o la IA ya respondió y la conversación continúa.'
  when 'en_seguimiento' then 'Hay diálogo activo: el asesor o la IA ya respondió y la conversación continúa.'
  when 'cotizado' then 'El cliente pidió cotización, precio o tarifa; o se envió o discutió una propuesta formal.'
  when 'en_cotizacion' then 'El cliente pidió cotización, precio o tarifa; o se envió o discutió una propuesta formal.'
  when 'negociacion' then 'Objeciones, comparación con competencia, negociación de condiciones o cierre pendiente.'
  else ai_enter_criteria
end
where ai_enter_criteria is null
  and slug in (
    'nuevo', 'contacto_inicial', 'contactado', 'en_seguimiento',
    'cotizado', 'en_cotizacion', 'negociacion'
  );
