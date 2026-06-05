-- Métricas por agente y varios agentes por usuario (misma plantilla permitida)
alter table public.voice_agents
  add column if not exists contacts_count integer not null default 0,
  add column if not exists contacted_count integer not null default 0,
  add column if not exists calls_count integer not null default 0,
  add column if not exists goals_achieved integer not null default 0,
  add column if not exists cost_usd numeric(12, 4) not null default 0,
  add column if not exists quality_label text not null default 'Aprendiendo';

alter table public.voice_agents
  drop constraint if exists voice_agents_user_id_template_id_key;

create index if not exists voice_agents_user_updated_idx
  on public.voice_agents (user_id, updated_at desc);
