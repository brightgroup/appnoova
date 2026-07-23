-- Baja el default de max_output_tokens de 2048 a 1024 para agentes nuevos.
-- Sigue siendo un tope de seguridad generoso (~750 palabras) muy por encima
-- de lo que necesita una respuesta corta de WhatsApp; el control real del
-- largo de la respuesta vive en el prompt del agente, no en este límite.
-- No toca los agentes existentes (todos siguen en 2048 salvo que se cambien
-- manualmente).

alter table public.text_agents
  alter column max_output_tokens set default 1024;
