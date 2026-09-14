-- Historial de chats de Ori (panel "Chats" en /dashboard/ori, al estilo Claude/Gemini/GPT) —
-- hoy /api/ori/chat es stateless (el frontend manda todo `messages` en cada request y no se
-- guarda nada), así que no hay de dónde listar conversaciones pasadas. title se autogenera del
-- primer mensaje del usuario (recortado), igual que hacen esos productos — no hay UI de renombrar
-- todavía. quote_id es opcional: cuando el chat se abrió desde "Cotizar con ORI" (?quote_id=) queda
-- vinculado a esa solicitud, pero no es obligatorio para el uso general del copiloto.

create table if not exists public.ori_conversations (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  title              text not null default 'Nuevo chat',
  quote_id           uuid references public.insurance_quote_requests(id) on delete set null,
  company_context_id uuid references public.company_contexts(id) on delete set null,
  model              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.ori_conversations is
  'Un chat guardado del copiloto Ori — cabecera de la conversación, los mensajes viven en ori_conversation_messages.';

create index if not exists ori_conversations_user_updated_idx
  on public.ori_conversations (user_id, updated_at desc);

create table if not exists public.ori_conversation_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ori_conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  tool_calls      jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

comment on table public.ori_conversation_messages is
  'Mensajes de un chat de Ori guardado, en orden de created_at.';

create index if not exists ori_conversation_messages_conversation_idx
  on public.ori_conversation_messages (conversation_id, created_at);

alter table public.ori_conversations enable row level security;
alter table public.ori_conversation_messages enable row level security;

drop policy if exists ori_conversations_member_select on public.ori_conversations;
create policy ori_conversations_member_select on public.ori_conversations
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = ori_conversations.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );

drop policy if exists ori_conversation_messages_member_select on public.ori_conversation_messages;
create policy ori_conversation_messages_member_select on public.ori_conversation_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.ori_conversations oc
      join public.organization_members om on om.organization_id = oc.organization_id
      where oc.id = ori_conversation_messages.conversation_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );
