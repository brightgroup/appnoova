-- Inbox: archivar conversaciones (ocultarlas de la bandeja sin borrar el historial)
alter table public.text_agent_conversations
  add column if not exists archived_at timestamptz;

create index if not exists text_agent_conversations_archived_idx
  on public.text_agent_conversations (user_id, archived_at);
