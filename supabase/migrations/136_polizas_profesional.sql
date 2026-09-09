-- Fase 4 del rediseño de pólizas — esquema profesional, basado en la ficha real (~90 campos)
-- traída en vivo de una cuenta real de Softseguros el 2026-09-09. Todo aditivo: `polizas` sigue
-- en 0 filas reales en producción, así que no hay backfill que hacer ni riesgo de romper datos.
--
-- Qué se agrega y por qué:
-- 1) Ciclo de vida completo del estado (Softseguros: Cotización→Expedición→Vigente→{Vencida,
--    Cancelada, No renovada, Devengada} — nuestro enum solo tenía la mitad).
-- 2) tipo_poliza (individual/colectiva/masiva) — necesario para saber cuándo aplica la tabla de
--    beneficiarios de abajo.
-- 3) Moneda + tasa de cambio — no todas las pólizas son en COP (viajes, aviación).
-- 4) Rol de "asegurado" separado del tomador — en Vida casi nunca son la misma persona; si es
--    null, el tomador ES el asegurado (no se duplica el dato en el caso común).
-- 5) Comisión real de agencia y de vendedor, con sus porcentajes — dejar la base lista para S6
--    Comisiones sin construir S6 todavía.
-- 6) es_soat — el SOAT no es un producto aparte en el modelo real, es una póliza con esta bandera.
-- 7) poliza_beneficiarios como tabla propia (no columnas) — una póliza de Vida puede tener varios,
--    cada uno con su documento/parentesco/porcentaje — exactamente como beneficiariopolizariesgo
--    en Softseguros.

alter table public.polizas
  drop constraint if exists polizas_estado_check;
alter table public.polizas
  add constraint polizas_estado_check check (
    estado in ('cotizada', 'expedicion', 'activa', 'vencida', 'cancelada', 'no_renovada', 'renovada', 'devengada')
  );

alter table public.polizas
  add column if not exists tipo_poliza text not null default 'individual'
    check (tipo_poliza in ('individual', 'colectiva', 'masiva')),
  add column if not exists moneda text not null default 'COP',
  add column if not exists tasa_cambio numeric(14,4) not null default 1,
  add column if not exists asegurado_nombre text,
  add column if not exists asegurado_documento text,
  add column if not exists porcentaje_comision_agencia numeric(6,2),
  add column if not exists comision_agencia numeric(14,2),
  add column if not exists vendedor_user_id uuid references auth.users(id) on delete set null,
  add column if not exists porcentaje_comision_vendedor numeric(6,2),
  add column if not exists comision_vendedor numeric(14,2),
  add column if not exists es_soat boolean not null default false;

comment on column public.polizas.asegurado_nombre is
  'Solo si difiere del tomador (contact_id) — ej. una póliza de Vida donde el tomador asegura a otra persona. Si es null, el tomador ES el asegurado.';
comment on column public.polizas.vendedor_user_id is
  'Asesor que se lleva la comisión de venta — distinto de asesor_asignado en crm_contacts (ese es "quién atiende al cliente", este es "quién vendió esta póliza").';

create table if not exists public.poliza_beneficiarios (
  id                    uuid primary key default gen_random_uuid(),
  poliza_id             uuid not null references public.polizas(id) on delete cascade,
  nombre                text not null,
  documento             text,
  parentesco            text,
  porcentaje_beneficio  numeric(5,2),
  excluido              boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.poliza_beneficiarios is
  'Beneficiarios de una póliza de Vida/Salud colectiva — una póliza puede tener varios, cada uno con su propio parentesco y % de beneficio (calcado de beneficiariopolizariesgo de Softseguros).';

create index if not exists poliza_beneficiarios_poliza_idx on public.poliza_beneficiarios (poliza_id);

alter table public.poliza_beneficiarios enable row level security;

drop policy if exists poliza_beneficiarios_via_poliza on public.poliza_beneficiarios;
create policy poliza_beneficiarios_via_poliza on public.poliza_beneficiarios
  for all using (
    exists (select 1 from public.polizas p where p.id = poliza_beneficiarios.poliza_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.polizas p where p.id = poliza_beneficiarios.poliza_id and p.user_id = auth.uid())
  );
