-- Integración Paddle (Merchant of Record, cobro recurrente en USD) como riel
-- de pago adicional al marcado manual actual (/admin/billing) y a Bold (COP).
-- No reemplaza nada existente: organization_subscriptions.billing_provider
-- distingue 'manual' | 'paddle' | 'bold'.

alter table public.plans
  add column if not exists paddle_price_id_sandbox text,
  add column if not exists paddle_price_id_live text;

alter table public.organization_subscriptions
  add column if not exists billing_provider text not null default 'manual',
  add column if not exists paddle_customer_id text,
  add column if not exists paddle_subscription_id text;

create index if not exists org_subscriptions_paddle_sub_idx
  on public.organization_subscriptions (paddle_subscription_id)
  where paddle_subscription_id is not null;

alter table public.billing_invoices
  add column if not exists paddle_transaction_id text;

create unique index if not exists billing_invoices_paddle_txn_idx
  on public.billing_invoices (paddle_transaction_id)
  where paddle_transaction_id is not null;

-- Catálogo sandbox creado vía API (ver Paddle → Products). Los IDs live se
-- completan cuando se dé de alta la cuenta live y se rehaga el catálogo.
update public.plans set paddle_price_id_sandbox = 'pri_01kyt7jn3xq8w71nc5e4v12v55' where id = 'esencial';
update public.plans set paddle_price_id_sandbox = 'pri_01kyt7jnehhg97wvbw8ksg0289' where id = 'crecimiento';
update public.plans set paddle_price_id_sandbox = 'pri_01kyt7jnsah4my3cq41v8sz524' where id = 'escala';

-- ── Registrar pago de Paddle (sincroniza suscripción + billetera + factura) ──
create or replace function public.billing_record_paddle_payment(
  p_org uuid,
  p_plan_id text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_amount_usd numeric,
  p_paddle_transaction_id text,
  p_paddle_subscription_id text default null,
  p_paddle_customer_id text default null
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
        billing_provider = 'paddle',
        paddle_subscription_id = coalesce(p_paddle_subscription_id, v_sub.paddle_subscription_id),
        paddle_customer_id = coalesce(p_paddle_customer_id, v_sub.paddle_customer_id),
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
     amount_usd, amount_cop, credits_included, status, paid_at, paddle_transaction_id)
  values
    (p_org, v_sub.id, p_plan_id, p_period_start, p_period_end, p_period_start,
     p_amount_usd, round(p_amount_usd * 4200), v_plan.monthly_credits, 'paid', now(), p_paddle_transaction_id)
  on conflict (organization_id, period_start) do update
    set status = 'paid',
        paid_at = now(),
        paddle_transaction_id = excluded.paddle_transaction_id,
        amount_usd = excluded.amount_usd,
        credits_included = excluded.credits_included,
        updated_at = now();

  update public.organizations
    set status = 'active', updated_at = now()
  where id = p_org and status = 'suspended';
end;
$$;
