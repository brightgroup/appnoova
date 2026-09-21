-- Plan interno "Empresarial" USD 480 — solo asignación admin (is_public=false).
-- Créditos proporcionales al ratio ya usado en Básico/Esencial/VIP
-- (~3.333 créditos por USD, ver docs/PRICING.md §13): 480 * 10000/3 = 1.600.000.
--
-- Nuevo: tabla `plan_organization_grants` — habilita un plan privado para orgs
-- específicas sin activarlo. La org ve el plan en /dashboard/facturacion y
-- puede pagarlo (Paddle o Bold) desde su propio panel; la suscripción solo
-- cambia de verdad cuando el pago se confirma (billing_record_paddle_payment /
-- billing_record_bold_payment), igual que cualquier otro plan del catálogo.
-- Ver src/lib/billing/plan-visibility.ts (planVisibleInBillingCatalog) y los
-- checkout routes de Paddle/Bold, que ahora consultan esta tabla.

create table if not exists public.plan_organization_grants (
  plan_id         text not null references public.plans(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (plan_id, organization_id)
);

alter table public.plan_organization_grants enable row level security;

drop policy if exists plan_org_grants_select on public.plan_organization_grants;
create policy plan_org_grants_select on public.plan_organization_grants
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = plan_organization_grants.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );

-- ── Plan Empresarial ────────────────────────────────────────────────────────

insert into public.plans (
  id, name, price_usd, monthly_credits, trial_days, whatsapp_included,
  max_text_agents, max_users, support_level, sort_order, features,
  is_active, is_system, is_public, max_links
) values (
  'empresarial', 'Empresarial', 480, 1600000, 0, true,
  null, 20, 'priority', 35,
  '{"crm_ai": true, "automations": true, "payment_gateways": true, "internal_only": true}'::jsonb,
  true, false, false, 7
)
on conflict (id) do update set
  name              = excluded.name,
  price_usd         = excluded.price_usd,
  monthly_credits   = excluded.monthly_credits,
  trial_days        = excluded.trial_days,
  whatsapp_included = excluded.whatsapp_included,
  max_text_agents   = excluded.max_text_agents,
  max_users         = excluded.max_users,
  support_level     = excluded.support_level,
  sort_order        = excluded.sort_order,
  features          = excluded.features,
  is_active         = excluded.is_active,
  is_system         = excluded.is_system,
  is_public         = excluded.is_public,
  max_links         = excluded.max_links,
  updated_at        = now();

-- Grupo Merpes (org 30d8c9a5-cd13-423e-84cf-1573acae865a, usuario
-- supervisorcallcenterfnb@grupomerpes.com) — habilitado para verlo y pagarlo
-- desde /dashboard/facturacion. NO se toca su suscripción actual (sigue en
-- "explorador"/trial); pasa a "Empresarial" solo si lo pagan.
insert into public.plan_organization_grants (plan_id, organization_id)
values ('empresarial', '30d8c9a5-cd13-423e-84cf-1573acae865a')
on conflict (plan_id, organization_id) do nothing;
