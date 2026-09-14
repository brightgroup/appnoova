-- Integración Bold (riel principal de cobro en COP — tarjeta, PSE, Nequi,
-- Botón Bancolombia) como riel de pago real para organization_subscriptions
-- con billing_provider = 'bold' (columna ya reservada desde la migración 084,
-- que introdujo Paddle como riel secundario en USD). No reemplaza nada.
--
-- Diferencia clave frente a Paddle: Bold no tiene motor de suscripciones
-- recurrentes (no hay cobro automático a una tarjeta guardada). El modelo es
-- "link de pago por factura/periodo": generamos un link de pago (API Link de
-- pagos de Bold) con `reference` = id de nuestra propia fila de seguimiento
-- (`bold_payment_requests`), el cliente lo paga, y el webhook de Bold nos
-- confirma la venta usando esa misma referencia — así resolvemos la org y el
-- propósito del pago sin depender de custom_data libre (Bold solo soporta un
-- único par metadata.key/value, a diferencia de Paddle).

alter table public.billing_invoices
  add column if not exists bold_transaction_id text;

create unique index if not exists billing_invoices_bold_txn_idx
  on public.billing_invoices (bold_transaction_id)
  where bold_transaction_id is not null;

-- ── Seguimiento de links de pago Bold (plan o recarga de créditos) ──────────
create table if not exists public.bold_payment_requests (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  kind               text not null check (kind in ('plan', 'topup')),
  plan_id            text,
  package_id         text,
  invoice_id         uuid references public.billing_invoices(id) on delete set null,
  amount_cop         numeric(14, 2) not null,
  amount_usd         numeric(10, 2) not null default 0,
  payment_link       text,
  checkout_url       text,
  status             text not null default 'pending'
                       check (status in ('pending', 'paid', 'expired', 'failed')),
  bold_transaction_id text,
  paid_at            timestamptz,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists bold_payment_requests_org_idx
  on public.bold_payment_requests (organization_id, created_at desc);

create unique index if not exists bold_payment_requests_txn_idx
  on public.bold_payment_requests (bold_transaction_id)
  where bold_transaction_id is not null;

-- Eventos de webhook Bold que no pudimos asociar a ningún `bold_payment_requests`
-- (venta de datáfono/POS ajena a la suscripción SaaS, reference corrupta, etc.)
-- — se registran para revisión manual, nunca se descartan en silencio.
create table if not exists public.bold_unmatched_events (
  id                 uuid primary key default gen_random_uuid(),
  event_type         text not null,
  bold_payment_id    text,
  reference          text,
  reason             text not null,
  payload            jsonb,
  created_at         timestamptz not null default now()
);

-- ── Registrar pago de Bold (sincroniza suscripción + billetera + factura) ──
create or replace function public.billing_record_bold_payment(
  p_org uuid,
  p_plan_id text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_amount_cop numeric,
  p_amount_usd numeric,
  p_bold_transaction_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub  public.organization_subscriptions%rowtype;
  v_plan public.plans%rowtype;
begin
  select * into v_plan from public.plans where id = p_plan_id;
  if not found then
    raise exception 'Plan % no existe', p_plan_id;
  end if;

  select * into v_sub from public.organization_subscriptions where organization_id = p_org;
  if not found then
    raise exception 'Organización % no tiene suscripción', p_org;
  end if;

  update public.organization_subscriptions
    set plan_id = p_plan_id,
        monthly_credits = v_plan.monthly_credits,
        price_usd = p_amount_usd,
        current_period_start = p_period_start,
        current_period_end = p_period_end,
        status = 'active',
        billing_provider = 'bold',
        updated_at = now()
  where organization_id = p_org;

  update public.organization_credit_wallets
    set period_start = p_period_start,
        period_end = p_period_end,
        included_credits = v_plan.monthly_credits,
        used_credits = case when p_period_start > v_sub.current_period_start then 0 else used_credits end,
        updated_at = now()
  where organization_id = p_org;

  insert into public.billing_invoices
    (organization_id, subscription_id, plan_id, period_start, period_end, due_date,
     amount_usd, amount_cop, credits_included, status, paid_at, bold_transaction_id)
  values
    (p_org, v_sub.id, p_plan_id, p_period_start, p_period_end, p_period_start,
     p_amount_usd, p_amount_cop, v_plan.monthly_credits, 'paid', now(), p_bold_transaction_id)
  on conflict (organization_id, period_start) do update
    set status = 'paid',
        paid_at = now(),
        bold_transaction_id = excluded.bold_transaction_id,
        amount_usd = excluded.amount_usd,
        amount_cop = excluded.amount_cop,
        credits_included = excluded.credits_included,
        updated_at = now();

  update public.organizations
    set status = 'active', updated_at = now()
  where id = p_org and status = 'suspended';
end;
$$;
