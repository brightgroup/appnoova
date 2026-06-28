-- Backfill organization_id en agentes y contextos legacy (creados tras 040 sin org en insert).

update public.text_agents a
set organization_id = uao.organization_id
from public.user_active_organization uao
where a.user_id = uao.user_id
  and a.organization_id is null;

update public.text_agents a
set organization_id = o.id
from public.organizations o
where a.user_id = o.owner_user_id
  and o.status = 'active'
  and a.organization_id is null;

update public.company_contexts c
set organization_id = uao.organization_id
from public.user_active_organization uao
where c.user_id = uao.user_id
  and c.organization_id is null;

update public.company_contexts c
set organization_id = o.id
from public.organizations o
where c.user_id = o.owner_user_id
  and o.status = 'active'
  and c.organization_id is null;
