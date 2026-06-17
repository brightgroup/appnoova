-- Gestión administrativa de suscripciones: descuentos, planes custom, ajuste de créditos
-- Admin puede cambiar plan, sobrescribir precio/créditos (para descuentos), cambiar estado,
-- añadir notas internas y hacer ajustes manuales de créditos.

-- ── Columnas adicionales en organization_subscriptions ──────────────────────

alter table public.organization_subscriptions
  add column if not exists notes        text,
  add column if not exists custom_label text;  -- ej. "Crecimiento -50% (3 meses)"

-- ── Función: actualizar suscripción desde admin ──────────────────────────────
-- Maneja: cambio de plan (resetea periodo), sobrescritura de precio/créditos
-- (para descuentos sin crear nuevos planes), cambio de estado, notas internas.

create or replace function public.billing_admin_update_subscription(
  p_org             uuid,
  p_plan_id         text     default null,  -- nuevo plan base (null = no cambiar)
  p_price_usd       numeric  default null,  -- precio custom USD (null = usar precio del plan)
  p_monthly_credits bigint   default null,  -- créditos custom (null = usar los del plan)
  p_status          text     default null,  -- nuevo estado billing (null = no cambiar)
  p_notes           text     default null,  -- notas internas (null = no cambiar)
  p_custom_label    text     default null   -- etiqueta visual (null = no cambiar)
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
begin
  select * into v_existing
  from public.organization_subscriptions
  where organization_id = p_org;

  v_plan_id := coalesce(p_plan_id, v_existing.plan_id, 'explorador');

  select * into v_plan from public.plans where id = v_plan_id;
  if not found then
    raise exception 'Plan % no existe', v_plan_id;
  end if;

  -- Precio y créditos: el override del admin tiene prioridad sobre el plan base
  v_price   := coalesce(p_price_usd,       v_plan.price_usd);
  v_credits := coalesce(p_monthly_credits, v_plan.monthly_credits);

  -- Si cambia el plan → resetear periodo; si solo cambia precio/créditos → mantener periodo
  v_changed := (v_existing.id is null)
            or (p_plan_id is not null and p_plan_id != v_existing.plan_id);

  if v_changed then
    v_ps := now();
    v_pe := now() + interval '1 month';
  else
    v_ps := coalesce(v_existing.current_period_start, now());
    v_pe := coalesce(v_existing.current_period_end,   now() + interval '1 month');
  end if;

  -- Estado final
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

  -- Actualizar billetera si cambia plan o créditos
  if v_changed or (p_monthly_credits is not null) then
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

  -- Crear factura pendiente si el plan tiene precio y es un cambio de plan/nueva suscripción
  if v_changed and v_price > 0 then
    insert into public.billing_invoices (
      organization_id, subscription_id, plan_id, period_start, period_end,
      due_date, amount_usd, amount_cop, credits_included, status
    ) values (
      p_org, v_sub_id, v_plan_id, v_ps, v_pe,
      v_ps + interval '5 days',
      v_price, round(v_price * 4200), v_credits, 'pending'
    )
    on conflict (organization_id, period_start) do nothing;
  end if;

  -- Sincronizar estado de la organización
  update public.organizations
  set status     = case
                     when v_status in ('active', 'trialing') then 'active'::text
                     when v_status = 'suspended'             then 'suspended'::text
                     else status
                   end,
      updated_at = now()
  where id = p_org;
end;
$$;

-- ── Función: ajuste manual de créditos desde admin ───────────────────────────
-- Positivo = añadir créditos, negativo = quitar créditos.
-- Se registra en el campo notes de la suscripción para trazabilidad.

create or replace function public.billing_admin_add_credits(
  p_org     uuid,
  p_credits bigint,
  p_reason  text default 'Ajuste manual admin'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text;
begin
  update public.organization_credit_wallets
  set topup_credits = greatest(0, coalesce(topup_credits, 0) + p_credits),
      updated_at    = now()
  where organization_id = p_org;

  if not found then
    raise exception 'Billetera no encontrada para org %', p_org;
  end if;

  v_note := format('[%s] %s: %s créditos',
    to_char(now() at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI'),
    p_reason,
    case when p_credits >= 0 then '+' else '' end || p_credits::text
  );

  update public.organization_subscriptions
  set notes      = case
                     when coalesce(notes, '') = '' then v_note
                     else notes || E'\n' || v_note
                   end,
      updated_at = now()
  where organization_id = p_org;
end;
$$;
