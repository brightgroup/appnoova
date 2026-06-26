-- Trial vencido sin plan de pago → suspender (no renovar créditos ni pasar a "active").
-- Evita que Explorador gratuito se renueve indefinidamente.

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
begin
  -- 1) Marcar facturas vencidas
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

    -- ¿factura vencida más allá del periodo de gracia?
    select * into unpaid
    from public.billing_invoices
    where organization_id = s.organization_id
      and status = 'overdue'
      and due_date + (s.grace_days || ' days')::interval < now()
    order by due_date asc
    limit 1;

    if found and not s.protected then
      update public.organization_subscriptions set status = 'suspended', updated_at = now() where id = s.id;
      update public.organizations set status = 'suspended', updated_at = now() where id = s.organization_id;
      n_suspended := n_suspended + 1;
      continue;
    elsif found then
      update public.organization_subscriptions set status = 'past_due', updated_at = now() where id = s.id;
    end if;

    -- 3) Renovar periodo si terminó (solo planes de pago o trial ya convertido)
    if s.current_period_end <= now() then
      -- Trial de pago aún en curso: no renovar hasta que pague o termine trial
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
    'trial_expired', n_trial_expired,
    'renewed', n_renewed
  );
end;
$$;
