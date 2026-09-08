-- Corrige la suspensión por mora, que hoy nunca se aplica de verdad:
--  1) `billing_run_renewals` sumaba `grace_days` dos veces (una en `due_date`,
--     otra en el chequeo de suspensión), duplicando el periodo de gracia real.
--  2) El chequeo de "past_due" era código muerto: por un `if/elsif` con la
--     misma condición, una org sin protección nunca pasaba por `past_due`,
--     saltaba directo de `active` a `suspended` o se quedaba `active` para
--     siempre si la condición doblemente exigente no se cumplía (que es lo
--     que le pasó a las 4 orgs con facturas vencidas desde julio).
--  3) El cron renovaba el periodo (y reseteaba créditos) de organizaciones con
--     facturas sin pagar, siempre que estuvieran dentro de la ventana de
--     gracia — es decir, premiaba con más crédito a quien no había pagado.
--  4) El cron pisaba el periodo de las suscripciones de Paddle, cuya fuente de
--     verdad real es el webhook `transaction.completed`/`subscription.*`.
--
-- `past_due_since` es el ancla común: se fija la primera vez que se detecta
-- mora (factura local vencida, o webhook de Paddle) y es lo único contra lo
-- que se mide `grace_days`, sin importar el `billing_provider`.

alter table public.organization_subscriptions
  add column if not exists past_due_since timestamptz;

create or replace function public.billing_run_renewals()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  unpaid public.billing_invoices%rowtype;
  new_ps timestamptz;
  new_pe timestamptz;
  n_overdue int := 0;
  n_suspended int := 0;
  n_renewed int := 0;
  n_trial_expired int := 0;
  n_past_due int := 0;
begin
  -- 1) Marcar facturas vencidas (due_date ya incluye la gracia del periodo)
  update public.billing_invoices
    set status = 'overdue', updated_at = now()
  where status = 'pending' and due_date < now();
  get diagnostics n_overdue = row_count;

  -- 2) Recorrer suscripciones activas para suspender o renovar
  for s in
    select sub.*, coalesce(pr.is_protected, false) as protected
    from public.organization_subscriptions sub
    left join public.organizations o on o.id = sub.organization_id
    left join public.profiles pr on pr.id = o.owner_user_id
    where sub.status in ('active', 'past_due', 'trialing')
  loop
    -- Trial gratuito vencido (Explorador): suspender si no hay plan de pago
    if s.status = 'trialing'
       and s.trial_ends_at is not null
       and s.trial_ends_at <= now()
       and coalesce(s.price_usd, 0) <= 0
       and not s.protected then
      update public.organization_subscriptions
        set status = 'suspended', updated_at = now()
      where id = s.id;
      update public.organizations
        set status = 'suspended', updated_at = now()
      where id = s.organization_id;
      n_trial_expired := n_trial_expired + 1;
      n_suspended := n_suspended + 1;
      continue;
    end if;

    -- Paddle: el webhook de suscripción es la fuente de verdad del periodo y
    -- de cuándo entra/sale de mora (ver subscription.past_due en el webhook).
    -- Aquí solo se mide el reloj de gracia sobre `past_due_since`.
    if s.billing_provider = 'paddle' then
      if s.status = 'past_due'
         and s.past_due_since is not null
         and not s.protected
         and s.past_due_since + (s.grace_days || ' days')::interval < now() then
        update public.organization_subscriptions set status = 'suspended', updated_at = now() where id = s.id;
        update public.organizations set status = 'suspended', updated_at = now() where id = s.organization_id;
        n_suspended := n_suspended + 1;
      end if;
      continue;
    end if;

    -- No-Paddle (manual / Bold): ¿hay una factura local vencida sin pagar?
    select * into unpaid
    from public.billing_invoices
    where organization_id = s.organization_id
      and status = 'overdue'
    order by due_date asc
    limit 1;

    if found then
      if s.status <> 'past_due' then
        update public.organization_subscriptions
          set status = 'past_due',
              past_due_since = coalesce(s.past_due_since, unpaid.due_date),
              updated_at = now()
        where id = s.id;
        n_past_due := n_past_due + 1;
      end if;

      if not s.protected
         and coalesce(s.past_due_since, unpaid.due_date) + (s.grace_days || ' days')::interval < now() then
        update public.organization_subscriptions set status = 'suspended', updated_at = now() where id = s.id;
        update public.organizations set status = 'suspended', updated_at = now() where id = s.organization_id;
        n_suspended := n_suspended + 1;
      end if;

      continue; -- no renovar periodo ni créditos mientras haya factura impaga
    end if;

    -- Al día: si venía de past_due, limpiar la marca
    if s.status = 'past_due' then
      update public.organization_subscriptions
        set status = 'active', past_due_since = null, updated_at = now()
      where id = s.id;
    end if;

    -- 3) Renovar periodo si terminó (ya al día con sus facturas)
    if s.current_period_end <= now() then
      -- Trial de pago aún en curso: no renovar hasta que pague o termine el trial
      if s.status = 'trialing' and s.trial_ends_at is not null and s.trial_ends_at > now() then
        continue;
      end if;

      new_ps := s.current_period_end;
      new_pe := new_ps + interval '1 month';
      while new_pe <= now() loop
        new_ps := new_pe;
        new_pe := new_pe + interval '1 month';
      end loop;

      update public.organization_subscriptions
        set current_period_start = new_ps,
            current_period_end = new_pe,
            status = case
              when status = 'trialing' and coalesce(price_usd, 0) > 0 then 'active'
              else status
            end,
            updated_at = now()
      where id = s.id;

      update public.organization_credit_wallets
        set period_start = new_ps,
            period_end = new_pe,
            included_credits = s.monthly_credits,
            used_credits = 0,
            topup_credits = case when topup_expires_at is not null and topup_expires_at <= now() then 0 else topup_credits end,
            updated_at = now()
      where organization_id = s.organization_id;

      if s.price_usd > 0 then
        insert into public.billing_invoices
          (organization_id, subscription_id, plan_id, period_start, period_end, due_date,
           amount_usd, amount_cop, credits_included, status)
        values
          (s.organization_id, s.id, s.plan_id, new_ps, new_pe, new_ps + (s.grace_days || ' days')::interval,
           s.price_usd, round(s.price_usd * 4200), s.monthly_credits, 'pending')
        on conflict (organization_id, period_start) do nothing;
      end if;

      n_renewed := n_renewed + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'overdue', n_overdue,
    'suspended', n_suspended,
    'past_due', n_past_due,
    'trial_expired', n_trial_expired,
    'renewed', n_renewed
  );
end;
$$;

-- Al pagar una factura local (Bold, transferencia marcada por admin), limpiar
-- también la marca de mora.
create or replace function public.billing_mark_invoice_paid(p_invoice uuid, p_by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.billing_invoices%rowtype;
begin
  update public.billing_invoices
    set status = 'paid', paid_at = now(), paid_by = p_by, updated_at = now()
  where id = p_invoice
  returning * into inv;

  if not found then
    raise exception 'Factura % no existe', p_invoice;
  end if;

  update public.organization_subscriptions
    set status = 'active', past_due_since = null, updated_at = now()
  where organization_id = inv.organization_id and status in ('suspended', 'past_due');

  update public.organizations
    set status = 'active', updated_at = now()
  where id = inv.organization_id and status = 'suspended';
end;
$$;

-- Idem al registrar un pago de Paddle: limpiar la marca de mora.
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

-- Marca de mora reportada por Paddle (subscription.past_due) y su reverso
-- (subscription.updated volviendo a active/trialing) — usadas por el webhook.
create or replace function public.billing_mark_paddle_past_due(p_paddle_subscription_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.organization_subscriptions
    set status = 'past_due',
        past_due_since = coalesce(past_due_since, now()),
        updated_at = now()
  where paddle_subscription_id = p_paddle_subscription_id
    and status in ('active', 'trialing');
$$;

create or replace function public.billing_clear_paddle_past_due(p_paddle_subscription_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.organization_subscriptions
    set status = 'active',
        past_due_since = null,
        updated_at = now()
  where paddle_subscription_id = p_paddle_subscription_id
    and status = 'past_due';
$$;
