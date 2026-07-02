-- Backfill organization_id en voice_agents legacy (058 no incluía voz).

update public.voice_agents v
set organization_id = uao.organization_id
from public.user_active_organization uao
where v.user_id = uao.user_id
  and v.organization_id is null;

update public.voice_agents v
set organization_id = o.id
from public.organizations o
where v.user_id = o.owner_user_id
  and o.status = 'active'
  and v.organization_id is null;
