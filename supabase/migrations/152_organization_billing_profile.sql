-- Datos fiscales de la organización (persona natural/jurídica, documento,
-- razón social, dirección) — requeridos antes de pagar un plan, para poder
-- emitir después la factura electrónica DIAN vía Siigo (fase 2, pendiente:
-- moneda de facturación y mapeo de producto/cliente en Siigo).
--
-- Escrituras solo vía service role desde /api/billing/profile (no hay policy
-- de insert/update: sigue el mismo patrón que el resto de tablas de billing,
-- donde el server valida membresía + permiso "billing:manage" antes de tocar
-- la fila).

create table if not exists public.organization_billing_profiles (
  organization_id     uuid primary key references public.organizations(id) on delete cascade,
  tipo_persona        text not null check (tipo_persona in ('natural', 'juridica')),
  tipo_documento      text not null check (tipo_documento in ('CC', 'NIT', 'CE', 'PA')),
  numero_documento    text not null,
  digito_verificacion text,
  razon_social        text not null,
  direccion           text,
  ciudad              text,
  telefono            text,
  email_facturacion   text,
  siigo_customer_id   text,
  updated_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.organization_billing_profiles enable row level security;

drop policy if exists org_billing_profile_select on public.organization_billing_profiles;
create policy org_billing_profile_select on public.organization_billing_profiles
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = organization_billing_profiles.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );
