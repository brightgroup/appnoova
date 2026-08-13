-- Habilita Supabase Realtime sobre automation_event_log para que la pestaña
-- "Ejecuciones" del workflow se actualice sola cuando llega un evento nuevo,
-- en vez de sondear el endpoint cada pocos segundos. La política RLS
-- existente (automation_event_log_member_select, ver 086_automations.sql)
-- ya restringe qué filas puede ver cada usuario — Realtime respeta esa misma
-- política sin configuración extra.

alter publication supabase_realtime add table public.automation_event_log;
