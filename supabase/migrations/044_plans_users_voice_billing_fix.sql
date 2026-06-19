-- Límites de usuarios por plan, CRM IA en planes superiores y fix de tipos en cambio de plan.

alter table public.plans
  add column if not exists max_users int;

comment on column public.plans.max_users is 'Máximo de usuarios activos/invitados; NULL = ilimitado';

insert into public.plans (
  id, name, price_usd, monthly_credits, trial_days, whatsapp_included,
  max_text_agents, max_users, support_level, sort_order, features
) values
  ('explorador',  'Explorador',  0,    15000,   14, false, 1,    1,    'email',      10, '{"crm_ai": false}'::jsonb),
  ('esencial',    'Esencial',    82,   350000,  0,  true,  null, 5,    'email',      20, '{"crm_ai": true}'::jsonb),
  ('crecimiento', 'Crecimiento', 345,  1500000, 0,  true,  null, 15,   'priority',   30, '{"crm_ai": true}'::jsonb),
  ('escala',      'Escala',      815,  3800000, 0,  true,  null, null, 'dedicated',  40, '{"crm_ai": true}'::jsonb)
on conflict (id) do update set
  name              = excluded.name,
  price_usd         = excluded.price_usd,
  monthly_credits   = excluded.monthly_credits,
  trial_days        = excluded.trial_days,
  whatsapp_included = excluded.whatsapp_included,
  max_text_agents   = excluded.max_text_agents,
  max_users         = excluded.max_users,
  support_level     = excluded.support_level,
  sort_order        = excluded.sort_order,
  features          = excluded.features,
  updated_at        = now();

-- Fix: organizations.status es account_status, no text
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
begin
  select * into v_existing
  from public.organization_subscriptions
  where organization_id = p_org;

  v_plan_id := coalesce(p_plan_id, v_existing.plan_id, 'explorador');

  select * into v_plan from public.plans where id = v_plan_id;
  if not found then
    raise exception 'Plan % no existe', v_plan_id;
  end if;

  v_price   := coalesce(p_price_usd,       v_plan.price_usd);
  v_credits := coalesce(p_monthly_credits, v_plan.monthly_credits);

  v_changed := (v_existing.id is null)
            or (p_plan_id is not null and p_plan_id != v_existing.plan_id);

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
