-- Motor de campañas: vínculo de llamadas ↔ campaña + settings de plataforma

-- 1) Vincular registros de llamada a una campaña (para registro unificado y métricas)
alter table public.voice_agent_calls
  add column if not exists campaign_id uuid references public.voice_campaigns(id) on delete set null;

alter table public.voice_agent_calls
  add column if not exists campaign_audience_row_id uuid
    references public.campaign_audience_rows(id) on delete set null;

create index if not exists voice_agent_calls_campaign_idx
  on public.voice_agent_calls (campaign_id, created_at desc);

-- 2) Configuración global de plataforma (superadmin) — key/value JSONB
create table if not exists public.platform_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

alter table public.platform_settings enable row level security;

-- Solo service_role (APIs admin). Deny-all para clientes.
drop policy if exists "platform_settings_deny" on public.platform_settings;
create policy "platform_settings_deny" on public.platform_settings
  for all using (false) with check (false);
