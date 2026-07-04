-- Prompt propio por campaña (override del prompt del agente, con variables {{...}})

alter table public.voice_campaigns
  add column if not exists prompt_template text;
