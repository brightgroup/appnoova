-- Agregar organization_id a whatsapp_channels para multitenancy completo
alter table public.whatsapp_channels
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- Backfill organization_id en whatsapp_channels
update public.whatsapp_channels c
set organization_id = uao.organization_id
from public.user_active_organization uao
where c.user_id = uao.user_id and c.organization_id is null;

create index if not exists whatsapp_channels_org_idx on public.whatsapp_channels (organization_id);
