-- Módulo S4 Siniestros (Noova Seguros, diseñado 2026-09-05) — el diferenciador
-- real frente a Guro: en Colombia la aseguradora tiene un mes para pagar
-- DESDE que la reclamación está "en forma" (documentación completa) — si
-- falta un papel, ese reloj legal ni arranca. Igual que polizas/insurance_quote_requests,
-- esto es un registro operativo mínimo (no administración del siniestro).
--
-- Escopado por organization_id (cola de trabajo del equipo, mismo criterio
-- que insurance_quote_requests) — el playbook de checklist/contacto por
-- aseguradora NO vive acá: reutiliza el mecanismo genérico de `data_tables`
-- ya existente (una tabla "Playbook de Siniestros" que el corredor edita en
-- /dashboard/tablas, sin UI nueva que mantener).

create table if not exists public.siniestros (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  contact_id            uuid,
  poliza_id             uuid references public.polizas(id) on delete set null,
  conversation_id       text,
  source                text not null default 'whatsapp' check (source in ('whatsapp', 'web', 'ori', 'manual')),
  aseguradora           text not null,
  ramo                  text not null,
  descripcion           text,
  fecha_ocurrencia      date,
  fecha_aviso           date not null default current_date,
  amparo_afectado       text,
  -- [{ "documento": "Cédula del conductor", "recibido": false }, ...]
  checklist_documentos  jsonb not null default '[]'::jsonb,
  estado                text not null default 'reportado' check (
    estado in ('reportado', 'documentos_pendientes', 'en_forma', 'radicado', 'pagado', 'rechazado', 'cerrado')
  ),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists siniestros_org_estado_idx
  on public.siniestros (organization_id, estado, fecha_aviso desc);

comment on table public.siniestros is
  'Registro operativo mínimo de siniestro — checklist de documentos y estado, no administración del siniestro ni del pago.';

alter table public.siniestros enable row level security;

create policy siniestros_member_select on public.siniestros
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = siniestros.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );
