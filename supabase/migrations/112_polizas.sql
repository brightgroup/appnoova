-- Registro operativo MÍNIMO de póliza (Noova Seguros, módulo "seguros" —
-- ver 111_seguros_module.sql). Deliberadamente ligero: solo lo necesario para
-- disparar automatizaciones (renovaciones, siniestros, cotizador). Noova NO
-- administra pólizas (endosos, anexos, liquidaciones, contabilidad, expediente
-- documental) — eso sigue viviendo en el sistema de registro del corredor
-- (Softseguros u otro) cuando exista. Ver docs/specs/NOOVA360_Spec_Producto_Servicio.md
-- para la frontera completa.
--
-- Cuelga de crm_contacts, que está escopado por user_id (no organization_id;
-- ver 026_crm.sql) — mismo patrón de propiedad y RLS que el resto del CRM,
-- no el patrón organization_members que usan los conectores (086/100).

create table if not exists public.polizas (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  contact_id          uuid not null references public.crm_contacts(id) on delete cascade,
  aseguradora         text not null,
  ramo                text not null,
  numero_poliza       text,
  vigencia_desde      date,
  vigencia_hasta      date,
  prima               numeric(14,2),
  periodicidad_pago   text check (periodicidad_pago in ('anual', 'semestral', 'trimestral', 'mensual')),
  estado              text not null default 'activa' check (estado in ('cotizada', 'activa', 'vencida', 'cancelada', 'renovada')),
  -- 'manual': cargada a mano. 'excel': carga masiva. 'pdf_ia': extraída de un PDF con IA.
  -- 'cotizador': emitida desde el cotizador de Noova Seguros (ver Fase 2 del plan).
  -- 'softseguros': sincronizada desde Softseguros (fuente opcional, no prerrequisito).
  fuente              text not null default 'manual' check (fuente in ('manual', 'excel', 'pdf_ia', 'cotizador', 'softseguros')),
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists polizas_user_idx
  on public.polizas (user_id, vigencia_hasta);

create index if not exists polizas_contact_idx
  on public.polizas (contact_id);

comment on table public.polizas is
  'Registro operativo mínimo de póliza (Noova Seguros): lo justo para disparar renovaciones, siniestros y cotizador. No es administración de pólizas.';

alter table public.polizas enable row level security;

create policy polizas_owner_all on public.polizas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
