-- Al cambiar plan_id, siempre sincronizar precio y créditos desde la tabla plans.

create or replace function public.billing_admin_update_subscription(
  p_org             uuid,
  p_plan_id         text     default null,
  p_price_usd       numeric  default null,
  p_monthly_credits bigint   default null,
  p_status          text     default null,
  p_notes           text     default null,
  p_custom_label    text     default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan     public.plans%rowtype;
  v_price    numeric(10,2);
  v_credits  bigint;
  v_existing public.organization_subscriptions%rowtype;
  v_plan_id  text;
  v_ps       timestamptz;
  v_pe       timestamptz;
  v_status   public.billing_status;
  v_sub_id   uuid;
  v_changed  boolean;
  v_plan_changed boolean;
begin
  select * into v_existing
  from public.organization_subscriptions
  where organization_id = p_org;

  v_plan_id := coalesce(p_plan_id, v_existing.plan_id, 'explorador');

  select * into v_plan from public.plans where id = v_plan_id;
  if not found then
    raise exception 'Plan % no existe', v_plan_id;
  end if;

  v_plan_changed := p_plan_id is not null
    and (v_existing.id is null or p_plan_id is distinct from v_existing.plan_id);

  if v_plan_changed then
    v_price := v_plan.price_usd;
    v_credits := v_plan.monthly_credits;
    v_changed := true;
  else
    v_price := coalesce(p_price_usd, coalesce(v_existing.price_usd, v_plan.price_usd));
    v_credits := coalesce(p_monthly_credits, coalesce(v_existing.monthly_credits, v_plan.monthly_credits));
    v_changed := v_existing.id is null;
  end if;

  if v_changed then
    v_ps := now();
    v_pe := now() + interval '1 month';
  else
    v_ps := coalesce(v_existing.current_period_start, now());
    v_pe := coalesce(v_existing.current_period_end,   now() + interval '1 month');
  end if;

  if p_status is not null then
    v_status := p_status::public.billing_status;
  elsif v_existing.id is null then
    v_status := 'active';
  else
    v_status := v_existing.status;
  end if;

  insert into public.organization_subscriptions (
    organization_id, plan_id, status, price_usd, monthly_credits,
    current_period_start, current_period_end, billing_day,
    grace_days, notes, custom_label, canceled_at, updated_at
  ) values (
    p_org, v_plan_id, v_status, v_price, v_credits,
    v_ps, v_pe, extract(day from v_ps)::int,
    coalesce(v_existing.grace_days, 5),
    case when p_notes is not null then p_notes else v_existing.notes end,
    case when p_custom_label is not null then p_custom_label else v_existing.custom_label end,
    null, now()
  )
  on conflict (organization_id) do update set
    plan_id              = v_plan_id,
    status               = v_status,
    price_usd            = v_price,
    monthly_credits      = v_credits,
    current_period_start = v_ps,
    current_period_end   = v_pe,
    billing_day          = extract(day from v_ps)::int,
    notes                = case when p_notes is not null
                                then p_notes
                                else organization_subscriptions.notes end,
    custom_label         = case when p_custom_label is not null
                                then p_custom_label
                                else organization_subscriptions.custom_label end,
    canceled_at          = null,
    updated_at           = now()
  returning id into v_sub_id;

  if v_changed or v_plan_changed or (p_monthly_credits is not null) then
    insert into public.organization_credit_wallets (
      organization_id, period_start, period_end, included_credits, used_credits, topup_credits
    ) values (
      p_org, v_ps, v_pe, v_credits, 0, 0
    )
    on conflict (organization_id) do update set
      period_start     = v_ps,
      period_end       = v_pe,
      included_credits = v_credits,
      used_credits     = 0,
      topup_credits    = 0,
      updated_at       = now();
  end if;

  if v_changed and v_price > 0 then
    insert into public.billing_invoices (
      organization_id, subscription_id, plan_id, period_start, period_end,
      due_date, amount_usd, amount_cop, credits_included, status
    ) values (
      p_org, v_sub_id, v_plan_id, v_ps, v_pe,
      v_ps + interval '5 days',
      v_price, round(v_price * coalesce(
        (select (value::text)::numeric from public.billing_settings where key = 'trm_cop'),
        4200
      )), v_credits, 'pending'
    )
    on conflict (organization_id, period_start) do nothing;
  end if;

  update public.organizations
  set status     = case
                     when v_status in ('active', 'trialing') then 'active'::public.account_status
                     when v_status = 'suspended'             then 'suspended'::public.account_status
                     else organizations.status
                   end,
      updated_at = now()
  where id = p_org;
end;
$$;

-- Corregir desfase precio/créditos vs catálogo al reconciliar billetera (sin etiqueta promo).

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

  select monthly_credits, price_usd into v_plan_credits, v_plan_price
  from public.plans where id = sub.plan_id;

  if found and sub.custom_label is null then
    if sub.monthly_credits is distinct from v_plan_credits
       or sub.price_usd is distinct from v_plan_price then
      update public.organization_subscriptions
        set monthly_credits = v_plan_credits,
            price_usd = v_plan_price,
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
    update public.organization_credit_wallets
      set included_credits = sub.monthly_credits,
          updated_at = now()
    where organization_id = p_org;
    w.included_credits := sub.monthly_credits;
  end if;

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
