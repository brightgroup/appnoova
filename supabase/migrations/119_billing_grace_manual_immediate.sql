-- Corrige un error mío en 118: para suscripciones no-Paddle (manual/Bold), la
-- factura local ya nace con `due_date = period_start + grace_days` — esa fecha
-- YA es la fecha límite con gracia incluida. 118 volvía a sumar `grace_days`
-- una segunda vez antes de suspender (vía past_due_since), reintroduciendo el
-- mismo doble periodo de gracia que se suponía debía eliminar.
--
-- Ahora: para manual/Bold, en cuanto la factura se marca `overdue` (due_date
-- ya pasó), se suspende en la misma pasada del cron — la fecha límite y la
-- fecha de suspensión son el mismo día. `past_due_since` queda solo como
-- registro histórico, ya no como una segunda espera.
--
-- Para Paddle no cambia nada: ahí sí aplica `grace_days` después de
-- `past_due_since`, porque ese evento (cobro de tarjeta fallido) no tiene
-- ninguna gracia previa incorporada.

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
    -- de cuándo entra/sale de mora (subscription.past_due/.updated). Ese
    -- evento no trae gracia incorporada, así que aquí sí se espera
    -- `grace_days` completos desde `past_due_since` antes de suspender.
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
    -- `due_date` = period_start + grace_days, así que la gracia ya se
    -- cumplió: se suspende en la misma pasada, sin esperar más días.
    select * into unpaid
    from public.billing_invoices
    where organization_id = s.organization_id
      and status = 'overdue'
    order by due_date asc
    limit 1;

    if found then
      if not s.protected then
        update public.organization_subscriptions
          set status = 'suspended',
              past_due_since = coalesce(s.past_due_since, unpaid.due_date),
              updated_at = now()
        where id = s.id;
        update public.organizations set status = 'suspended', updated_at = now() where id = s.organization_id;
        n_suspended := n_suspended + 1;
      elsif s.status <> 'past_due' then
        -- Org protegida con factura vencida: se deja constancia sin suspender.
        update public.organization_subscriptions
          set status = 'past_due',
              past_due_since = coalesce(s.past_due_since, unpaid.due_date),
              updated_at = now()
        where id = s.id;
        n_past_due := n_past_due + 1;
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
