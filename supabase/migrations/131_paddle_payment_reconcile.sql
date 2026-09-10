-- Un pago de Paddle no debe dejar la org suspendida:
--  1) Idempotencia por paddle_transaction_id (reintentos de webhook).
--  2) Saldar facturas locales pending/overdue (el cobro de Paddle las cubre).
--     Antes el RPC insertaba una factura nueva del periodo Paddle y dejaba
--     la overdue intacta; el cron de cobro manual volvía a suspender.
--  3) Tabla de eventos que no se pudieron asociar a una org.

create table if not exists public.paddle_unmatched_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  paddle_transaction_id text,
  paddle_customer_id text,
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists paddle_unmatched_events_txn_idx
  on public.paddle_unmatched_events (paddle_transaction_id)
  where paddle_transaction_id is not null;

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
  v_existing_id uuid;
begin
  select * into v_plan from public.plans where id = p_plan_id;
  if not found then
    raise exception 'Plan % no existe', p_plan_id;
  end if;

  select * into v_sub from public.organization_subscriptions where organization_id = p_org;
  if not found then
    raise exception 'Organización % no tiene suscripción', p_org;
  end if;

  select id into v_existing_id
    from public.billing_invoices
   where paddle_transaction_id = p_paddle_transaction_id
   limit 1;

  if v_existing_id is not null then
    update public.organization_subscriptions
      set status = 'active',
          past_due_since = null,
          billing_provider = 'paddle',
          paddle_subscription_id = coalesce(p_paddle_subscription_id, paddle_subscription_id),
          paddle_customer_id = coalesce(p_paddle_customer_id, paddle_customer_id),
          updated_at = now()
    where organization_id = p_org;

    update public.organizations
      set status = 'active', updated_at = now()
    where id = p_org and status = 'suspended';

    return;
  end if;

  update public.organization_subscriptions
    set plan_id = p_plan_id,
        monthly_credits = v_plan.monthly_credits,
        price_usd = p_amount_usd,
        current_period_start = p_period_start,
        current_period_end = p_period_end,
        status = 'active',
        past_due_since = null,
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

  -- El pago de Paddle cubre la mora local (mismo caso C Market: factura
  -- overdue de cobro manual + checkout de tarjeta el mismo día).
  update public.billing_invoices
    set status = 'paid',
        paid_at = now(),
        notes = trim(both from coalesce(notes || E'\n', '')
          || 'Saldada por pago Paddle ' || p_paddle_transaction_id),
        updated_at = now()
  where organization_id = p_org
    and status in ('pending', 'overdue');

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
        plan_id = excluded.plan_id,
        period_end = excluded.period_end,
        updated_at = now();

  update public.organizations
    set status = 'active', updated_at = now()
  where id = p_org and status = 'suspended';
end;
$$;
