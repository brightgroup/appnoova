-- Inbox: asignación humana y contador de no leídos en conversaciones de texto
alter table public.text_agent_conversations
  add column if not exists assigned_to text,
  add column if not exists handoff_mode text not null default 'ai',
  add column if not exists unread_count integer not null default 0;

create index if not exists text_agent_conversations_inbox_idx
  on public.text_agent_conversations (user_id, updated_at desc);
