-- Los presets del selector de "Máximo de tokens de salida" ya no incluyen
-- 2048 como opción individual (se unificó con el nuevo estándar de 1024)
-- para que las etiquetas sean consistentes. Sin este backfill, los agentes
-- que ya tenían 2048 quedarían con un valor fuera de la lista de opciones.
-- 1024 sigue siendo un tope de seguridad generoso (~750 palabras), no afecta
-- el comportamiento real de ningún agente existente.

update public.text_agents
set max_output_tokens = 1024
where max_output_tokens = 2048;
