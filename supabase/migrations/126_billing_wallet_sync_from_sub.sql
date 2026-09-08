-- billing_sync_wallet solo adelantaba la billetera por su propio calendario
-- interno (period_end + 1 mes, repetido hasta superar `now()`), totalmente
-- desconectado de organization_subscriptions.current_period_start/end. Eso
-- funciona mientras el período SIEMPRE cambie a través de esta misma función
-- o de billing_run_renewals/billing_manual_activate (que sí actualizan
-- ambas tablas) — pero cualquier ajuste manual del período de la suscripción
-- (fecha de corte movida a mano, período corto negociado, etc.) deja la
-- billetera con fechas viejas sin que nada lo detecte, porque
-- `w.period_end <= now()` seguía siendo falso. Caso real: al mover el corte
-- de C market al día 5 y acortar el período de Mil hojaldres/Qbit, la
-- billetera de las tres quedó con period_end viejo — la UI, que lee
-- wallet.period_end como "próxima renovación", mostraba una fecha equivocada.
--
-- Ahora la billetera se resincroniza contra las fechas de la suscripción
-- (fuente de verdad) cada vez que difieren, no solo cuando expiró por su
-- propio calendario. Esto la vuelve un espejo fiel de current_period_start/end
-- sin importar cómo haya cambiado ese período. used_credits se sigue
-- recalculando siempre desde usage_events dentro del período vigente (no se
-- fija a 0 a mano), igual que antes.

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

  if w.period_end <= now()
     or w.period_start is distinct from sub.current_period_start
     or w.period_end is distinct from sub.current_period_end then
    update public.organization_credit_wallets
      set period_start = sub.current_period_start,
          period_end = sub.current_period_end,
          included_credits = sub.monthly_credits,
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
