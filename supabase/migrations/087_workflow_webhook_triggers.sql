-- Índice de nodos "trigger.webhook" dentro de workflows.graph — resuelve el
-- token de la URL pública de callback a un workflow/nodo concreto, sin tener
-- que escanear el grafo de todos los workflows de la organización. La fuente
-- de verdad del token es el propio grafo (node.data.webhookToken); esta tabla
-- es solo un índice que se resincroniza en cada guardado del workflow.

create table if not exists public.workflow_webhook_triggers (
  token            text primary key,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  workflow_id      uuid not null references public.workflows(id) on delete cascade,
  node_id          text not null,
  created_at       timestamptz not null default now(),
  unique (workflow_id, node_id)
);

create index if not exists workflow_webhook_triggers_org_idx
  on public.workflow_webhook_triggers (organization_id);

create index if not exists workflow_webhook_triggers_workflow_idx
  on public.workflow_webhook_triggers (workflow_id);

comment on table public.workflow_webhook_triggers is
  'Índice de nodos trigger.webhook dentro de workflows.graph, para resolver el callback público /api/automations/inbound/[token] a un workflow/nodo concreto.';

alter table public.workflow_webhook_triggers enable row level security;

create policy workflow_webhook_triggers_member_select on public.workflow_webhook_triggers
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = workflow_webhook_triggers.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );
