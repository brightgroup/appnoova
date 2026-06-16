-- Agregar columnas de subcuenta de Twilio a organizaciones para multitenancy
alter table public.organizations
  add column if not exists twilio_subaccount_sid text,
  add column if not exists twilio_subaccount_auth_token text;

-- Agregar organization_id a las solicitudes de WhatsApp
alter table public.whatsapp_line_requests
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- Actualizar solicitudes existentes (opcional, si hubiera)
update public.whatsapp_line_requests r
set organization_id = uao.organization_id
from public.user_active_organization uao
where r.user_id = uao.user_id and r.organization_id is null;

create index if not exists whatsapp_line_requests_org_idx on public.whatsapp_line_requests (organization_id);
