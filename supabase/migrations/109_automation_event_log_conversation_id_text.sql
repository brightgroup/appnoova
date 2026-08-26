-- automation_event_log.conversation_id era `uuid` porque hasta ahora solo
-- guardaba ids de text_agent_conversations (WhatsApp) — un UUID real. Los
-- threadId de HubSpot (ver hubspot-runner.ts) son numéricos como
-- "11123799831", no UUID válido: cada insert con conversation_id de HubSpot
-- fallaba en Postgres, y como el código no revisaba el `error` de vuelta
-- (supabase-js no lanza excepción, solo lo devuelve), el fallo quedaba en
-- silencio — el runner corría bien pero nunca dejaba rastro en el log.
--
-- No hay FK sobre esta columna (ver comentario original en 086_automations.sql:
-- "conversation_id uuid; -- sin FK"), así que ensanchar el tipo a texto es
-- seguro: sigue funcionando exactamente igual para los UUID de WhatsApp ya
-- guardados (un uuid es válido como texto) y ahora también acepta ids de
-- HubSpot u otro proveedor futuro.

alter table public.automation_event_log
  alter column conversation_id type text using conversation_id::text;
