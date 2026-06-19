-- Alinea billetera con suscripción (créditos del plan) y recalcula consumo desde usage_events.

create or replace function public.billing_sync_wallet(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sub public.organization_subscriptions%rowtype;
  w public.organization_credit_wallets%rowtype;
  v_plan_credits bigint;
  v_plan_price numeric(10,2);
  v_used_sum bigint;
  ps timestamptz;
  pe timestamptz;
begin
  select * into sub from public.organization_subscriptions where organization_id = p_org;
  if not found then
    return;
  end if;

  -- Corregir suscripción si quedó con créditos de un plan anterior (sin override custom)
  select monthly_credits, price_usd into v_plan_credits, v_plan_price
  from public.plans where id = sub.plan_id;

  if found and sub.custom_label is null and v_plan_credits is not null then
    if sub.monthly_credits is distinct from v_plan_credits then
      update public.organization_subscriptions
        set monthly_credits = v_plan_credits,
            price_usd = case
              when sub.price_usd = 0 and v_plan_price > 0 then v_plan_price
              else sub.price_usd
            end,
            updated_at = now()
      where organization_id = p_org;
      select * into sub from public.organization_subscriptions where organization_id = p_org;
    end if;
  end if;

  select * into w from public.organization_credit_wallets where organization_id = p_org;
  if not found then
    insert into public.organization_credit_wallets
      (organization_id, period_start, period_end, included_credits, used_credits)
    values (p_org, sub.current_period_start, sub.current_period_end, sub.monthly_credits, 0);
    return;
  end if;

  if w.period_end <= now() then
    ps := w.period_end;
    pe := ps + interval '1 month';
    while pe <= now() loop
      ps := pe;
      pe := pe + interval '1 month';
    end loop;
    update public.organization_credit_wallets
      set period_start = ps,
          period_end = pe,
          included_credits = sub.monthly_credits,
          used_credits = 0,
          topup_credits = case
            when topup_expires_at is not null and topup_expires_at <= now() then 0
            else topup_credits
          end,
          updated_at = now()
    where organization_id = p_org;
    select * into w from public.organization_credit_wallets where organization_id = p_org;
  elsif w.included_credits is distinct from sub.monthly_credits then
    -- Cambio de plan o corrección mid-period
    update public.organization_credit_wallets
      set included_credits = sub.monthly_credits,
          updated_at = now()
    where organization_id = p_org;
    w.included_credits := sub.monthly_credits;
  end if;

  -- Consumo real del periodo = suma del ledger (fuente de verdad)
  select coalesce(sum(credits_charged), 0)::bigint into v_used_sum
  from public.usage_events
  where organization_id = p_org
    and created_at >= w.period_start
    and created_at < w.period_end;

  if v_used_sum is distinct from w.used_credits then
    update public.organization_credit_wallets
      set used_credits = v_used_sum,
          updated_at = now()
    where organization_id = p_org;
  end if;
end;
$$;

-- Backfill: reconciliar todas las organizaciones con suscripción activa
do $$
declare
  r record;
begin
  for r in select organization_id from public.organization_subscriptions loop
    perform public.billing_sync_wallet(r.organization_id);
  end loop;
end $$;
