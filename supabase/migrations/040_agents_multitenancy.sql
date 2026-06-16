-- Migración para completar la transición multitenant en módulos de agentes y contextos
-- Añadir organization_id a text_agents, voice_agents y company_contexts

-- 1. Contextos de empresa
alter table public.company_contexts
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- Backfill organization_id para contextos existentes
update public.company_contexts c
set organization_id = uao.organization_id
from public.user_active_organization uao
where c.user_id = uao.user_id and c.organization_id is null;

create index if not exists company_contexts_org_idx on public.company_contexts (organization_id);

-- 2. Agentes de texto
alter table public.text_agents
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- Backfill organization_id para agentes existentes
update public.text_agents a
set organization_id = uao.organization_id
from public.user_active_organization uao
where a.user_id = uao.user_id and a.organization_id is null;

create index if not exists text_agents_org_idx on public.text_agents (organization_id);

-- 3. Agentes de voz
alter table public.voice_agents
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- Backfill organization_id para agentes existentes
update public.voice_agents v
set organization_id = uao.organization_id
from public.user_active_organization uao
where v.user_id = uao.user_id and v.organization_id is null;

create index if not exists voice_agents_org_idx on public.voice_agents (organization_id);
