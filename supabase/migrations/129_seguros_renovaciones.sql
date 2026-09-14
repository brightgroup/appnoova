-- S2 Renovaciones (Noova Seguros) — el "wedge de venta" del plan: WhatsApp
-- escalonado a 30/15/5 días antes de vencer una póliza. Dos tablas:
--
-- 1) seguros_renovacion_rules: configuración por organización (una fila por
--    org, igual que erp_inventory_alert_rules) — apagado por defecto hasta
--    que la organización elija canal y plantilla, porque sin eso el cron no
--    tiene con qué enviar nada.
-- 2) seguros_renovacion_avisos: bitácora de cada aviso enviado por póliza y
--    por hito. El unique(poliza_id, dias_aviso) es la idempotencia real: si
--    el cron corre dos veces en la misma hora (o se reintenta), la segunda
--    inserción choca con la primera y no se reenvía.
--
-- polizas es user_id-scoped (ver 112_polizas.sql), pero estas dos tablas
-- viven en el eje organization_id del resto del módulo seguros — mismo
-- criterio que siniestros (116): contact_id/poliza_id son referencias
-- sueltas hacia el eje CRM, sin intentar unificar los dos ejes de scoping.

create table if not exists public.seguros_renovacion_rules (
  organization_id     uuid primary key references public.organizations(id) on delete cascade,
  enabled             boolean not null default false,
  hora_envio          smallint not null default 9 check (hora_envio between 0 and 23),
  dias_aviso          int[] not null default '{30,15,5}',
  whatsapp_channel_id uuid references public.whatsapp_channels(id) on delete set null,
  template_id         uuid references public.whatsapp_templates(id) on delete set null,
  escalar_a_llamada   boolean not null default false,
  updated_at          timestamptz not null default now()
);

comment on table public.seguros_renovacion_rules is
  'Configuración por organización de la cadencia de recordatorios de renovación — apagada por defecto hasta elegir canal y plantilla.';

alter table public.seguros_renovacion_rules enable row level security;

drop policy if exists seguros_renovacion_rules_member_select on public.seguros_renovacion_rules;
create policy seguros_renovacion_rules_member_select on public.seguros_renovacion_rules
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = seguros_renovacion_rules.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );

create table if not exists public.seguros_renovacion_avisos (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  poliza_id       uuid not null references public.polizas(id) on delete cascade,
  contact_id      uuid,
  dias_aviso      smallint not null,
  phone_e164      text,
  estado          text not null check (estado in ('enviado', 'fallido', 'omitido_optout', 'sin_telefono')),
  error           text,
  sent_at         timestamptz,
  respondio_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (poliza_id, dias_aviso)
);

comment on table public.seguros_renovacion_avisos is
  'Un registro por póliza y por hito (30/15/5 días) — el unique evita reenviar si el cron corre dos veces.';

create index if not exists seguros_renovacion_avisos_org_idx
  on public.seguros_renovacion_avisos (organization_id, created_at desc);

alter table public.seguros_renovacion_avisos enable row level security;

drop policy if exists seguros_renovacion_avisos_member_select on public.seguros_renovacion_avisos;
create policy seguros_renovacion_avisos_member_select on public.seguros_renovacion_avisos
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = seguros_renovacion_avisos.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );
