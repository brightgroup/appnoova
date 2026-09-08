-- Activación/renovación manual ágil para clientes que pagan directo (transferencia,
-- Wise, etc.) en vez de por Paddle. Salda las facturas locales pendientes/vencidas
-- (el pago manual las cubre), abre un periodo nuevo ya marcado como pagado, y deja
-- la referencia del pago en las notas de la suscripción.

create or replace function public.billing_manual_activate(
  p_org uuid,
  p_plan_id text,
  p_months int default 1,
  p_reference text default null,
  p_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans%rowtype;
  v_sub  public.organization_subscriptions%rowtype;
  v_ps timestamptz := now();
  v_pe timestamptz;
  v_note text;
begin
  select * into v_plan from public.plans where id = p_plan_id;
  if not found then
    raise exception 'Plan % no existe', p_plan_id;
  end if;

  select * into v_sub from public.organization_subscriptions where organization_id = p_org;
  if not found then
    raise exception 'Organización % no tiene fila de suscripción', p_org;
  end if;

  v_pe := v_ps + (greatest(p_months, 1) || ' months')::interval;

  -- El pago manual salda cualquier factura local pendiente/vencida.
  update public.billing_invoices
    set status = 'paid', paid_at = now(), paid_by = p_by, updated_at = now()
  where organization_id = p_org and status in ('pending', 'overdue');

  v_note := coalesce(nullif(v_sub.notes, '') || E'\n', '')
    || to_char(now(), 'YYYY-MM-DD') || ' — pago manual registrado'
    || case when p_reference is not null then ' (ref: ' || p_reference || ')' else '' end;

  update public.organization_subscriptions
    set plan_id = p_plan_id,
        price_usd = v_plan.price_usd,
        monthly_credits = v_plan.monthly_credits,
        billing_provider = 'manual',
        status = 'active',
        past_due_since = null,
        current_period_start = v_ps,
        current_period_end = v_pe,
        notes = v_note,
        updated_at = now()
  where organization_id = p_org;

  update public.organization_credit_wallets
    set period_start = v_ps,
        period_end = v_pe,
        included_credits = v_plan.monthly_credits,
        used_credits = 0,
        updated_at = now()
  where organization_id = p_org;

  insert into public.billing_invoices
    (organization_id, subscription_id, plan_id, period_start, period_end, due_date,
     amount_usd, amount_cop, credits_included, status, paid_at, paid_by)
  values
    (p_org, v_sub.id, p_plan_id, v_ps, v_pe, v_ps,
     v_plan.price_usd, round(v_plan.price_usd * 4200), v_plan.monthly_credits, 'paid', now(), p_by)
  on conflict (organization_id, period_start) do update
    set status = 'paid', paid_at = now(), paid_by = excluded.paid_by, updated_at = now();

  update public.organizations
    set status = 'active', updated_at = now()
  where id = p_org;
end;
$$;
