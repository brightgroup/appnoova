-- Activación del cotizador de seguros por agente (Noova Seguros, Fase 2.3) —
-- mismo espíritu que scheduling_rules (076_agent_scheduling.sql): que la
-- organización tenga una aseguradora conectada no alcanza, cada agente
-- necesita su propio interruptor explícito. Ver src/lib/insurers/quoting-rules.ts.

alter table public.text_agents
  add column if not exists quoting_rules jsonb not null default '{"enabled": false, "insurer_connection_ids": []}'::jsonb;

alter table public.voice_agents
  add column if not exists quoting_rules jsonb not null default '{"enabled": false, "insurer_connection_ids": []}'::jsonb;
