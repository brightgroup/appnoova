-- Citas creadas por los agentes IA (registro local + espejo del evento en Google Calendar)

create table if not exists public.appointments (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  agent_id              uuid,
  agent_type            text not null check (agent_type in ('text', 'voice')),
  calendar_connection_id uuid references public.calendar_connections(id) on delete set null,
  google_event_id       text,
  contact_name          text not null,
  contact_email         text,
  contact_phone         text,
  reason                text,
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  -- Referencia laxa (no FK): puede apuntar a text_agent_conversations.id o a una llamada de voz.
  conversation_id       uuid,
  source_channel        text,
  status                text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists appointments_org_idx on public.appointments (organization_id, starts_at);
create index if not exists appointments_conversation_idx on public.appointments (conversation_id);

comment on table public.appointments is
  'Citas agendadas por los agentes IA. El calendario externo (Google) es la fuente de verdad de disponibilidad; esta tabla es el registro/CRM local.';

alter table public.appointments enable row level security;

create policy appointments_member_select on public.appointments
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = appointments.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );
