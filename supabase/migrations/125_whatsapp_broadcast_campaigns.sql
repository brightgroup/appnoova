-- Campañas de difusión por WhatsApp (S8, diseñado 2026-09-05, construido
-- 2026-09-07) — misma lógica sirve para la campaña de renovaciones (S2) y
-- para pedir reseñas en Google Maps: elegir una plantilla ya aprobada +
-- una lista de contactos, y un job manda uno por uno respetando opt-out.
--
-- Escopada por organization_id (cola de trabajo del equipo, mismo criterio
-- que insurance_quote_requests/siniestros). contact_id es una referencia
-- suelta sin FK estricta a propósito — crm_contacts está escopado por
-- user_id (modelo distinto), no por organization_id.

create table if not exists public.whatsapp_broadcast_campaigns (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  name                  text not null,
  whatsapp_channel_id   uuid not null references public.whatsapp_channels(id) on delete cascade,
  template_id           uuid not null references public.whatsapp_templates(id) on delete restrict,
  -- borrador: se está armando. enviando: el cron la está procesando. completada/pausada.
  status                text not null default 'borrador' check (status in ('borrador', 'enviando', 'completada', 'pausada')),
  created_by_user_id    uuid references auth.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists whatsapp_broadcast_campaigns_org_idx
  on public.whatsapp_broadcast_campaigns (organization_id, status);

comment on table public.whatsapp_broadcast_campaigns is
  'Campaña de envío masivo por WhatsApp (renovaciones, reseñas de Google, etc.) — una plantilla ya aprobada a una lista de destinatarios.';

alter table public.whatsapp_broadcast_campaigns enable row level security;

create policy whatsapp_broadcast_campaigns_member_select on public.whatsapp_broadcast_campaigns
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = whatsapp_broadcast_campaigns.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );

create table if not exists public.whatsapp_broadcast_recipients (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.whatsapp_broadcast_campaigns(id) on delete cascade,
  contact_id        uuid,
  contact_name      text,
  phone_e164        text not null,
  -- Valores concretos para las variables {{1}}, {{2}}... de la plantilla, propios de este destinatario.
  variable_values   jsonb not null default '{}'::jsonb,
  estado            text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'fallido', 'omitido_optout')),
  error             text,
  sent_at           timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists whatsapp_broadcast_recipients_campaign_idx
  on public.whatsapp_broadcast_recipients (campaign_id, estado);

comment on table public.whatsapp_broadcast_recipients is
  'Un destinatario por fila — permite reintentar solo los fallidos sin reenviar a toda la lista.';

alter table public.whatsapp_broadcast_recipients enable row level security;

create policy whatsapp_broadcast_recipients_member_select on public.whatsapp_broadcast_recipients
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.whatsapp_broadcast_campaigns c
      join public.organization_members om on om.organization_id = c.organization_id
      where c.id = whatsapp_broadcast_recipients.campaign_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );
