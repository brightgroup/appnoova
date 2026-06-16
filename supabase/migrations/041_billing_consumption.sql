-- Facturación y consumo (créditos = COP, estilo Dapta: créditos mensuales NO acumulables)
-- Modelo: cada organización tiene una suscripción (plan), una billetera con créditos
-- del periodo que se reinician cada mes, un ledger de consumo en tiempo real
-- (usage_events) con lo que se cobra al cliente y el costo real del proveedor,
-- y facturas mensuales que al vencer suspenden la cuenta.

-- ── Enums ───────────────────────────────────────────────────────────────────

do $$ begin
  create type public.billing_status as enum ('trialing', 'active', 'past_due', 'suspended', 'canceled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.invoice_status as enum ('pending', 'paid', 'overdue', 'void');
exception when duplicate_object then null;
end $$;

-- ── Catálogo de planes ──────────────────────────────────────────────────────

create table if not exists public.plans (
  id                text primary key,
  name              text not null,
  price_usd         numeric(10,2) not null default 0,
  monthly_credits   bigint not null default 0,
  trial_days        int not null default 0,
  whatsapp_included boolean not null default false,
  max_text_agents   int,                       -- null = ilimitado
  support_level     text not null default 'email',
  sort_order        int not null default 0,
  is_active         boolean not null default true,
  features          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Seed planes (valores de docs/PRICING.md, TRM ref $4.200)
insert into public.plans (id, name, price_usd, monthly_credits, trial_days, whatsapp_included, max_text_agents, support_level, sort_order) values
  ('explorador',  'Explorador',  0,    15000,   14, false, 1,    'email',      10),
  ('esencial',    'Esencial',    82,   350000,  0,  true,  null, 'email',      20),
  ('crecimiento', 'Crecimiento', 345,  1500000, 0,  true,  null, 'priority',   30),
  ('escala',      'Escala',      815,  3800000, 0,  true,  null, 'dedicated',  40)
on conflict (id) do update set
  name = excluded.name,
  price_usd = excluded.price_usd,
  monthly_credits = excluded.monthly_credits,
  trial_days = excluded.trial_days,
  whatsapp_included = excluded.whatsapp_included,
  max_text_agents = excluded.max_text_agents,
  support_level = excluded.support_level,
  sort_order = excluded.sort_order,
  updated_at = now();

-- ── Suscripción por organización (1:1) ──────────────────────────────────────

create table if not exists public.organization_subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null unique references public.organizations(id) on delete cascade,
  plan_id               text not null references public.plans(id),
  status                public.billing_status not null default 'trialing',
  monthly_credits       bigint not null default 0,        -- snapshot del plan (permite overrides)
  price_usd             numeric(10,2) not null default 0,
  current_period_start  timestamptz not null default now(),
  current_period_end    timestamptz not null,
  trial_ends_at         timestamptz,
  grace_days            int not null default 5,
  billing_day           int,
  canceled_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists org_subscriptions_status_idx on public.organization_subscriptions (status);
create index if not exists org_subscriptions_period_end_idx on public.organization_subscriptions (current_period_end);

-- ── Billetera de créditos del periodo (saldo en tiempo real) ────────────────

create table if not exists public.organization_credit_wallets (
  organization_id   uuid primary key references public.organizations(id) on delete cascade,
  period_start      timestamptz not null,
  period_end        timestamptz not null,
  included_credits  bigint not null default 0,    -- asignación del plan este periodo
  used_credits      bigint not null default 0,    -- consumido (incrementa en tiempo real)
  topup_credits     bigint not null default 0,    -- recargas vigentes
  topup_expires_at  timestamptz,
  updated_at        timestamptz not null default now()
);

-- ── Ledger de consumo (un registro por acción facturable) ───────────────────

create table if not exists public.usage_events (
  id                 bigint generated always as identity primary key,
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  user_id            uuid,
  event_type         text not null,               -- ori, milink, widget, text_test, whatsapp_ai, whatsapp_manual, voice, doc_scan, form_fill, quote
  channel            text,
  quantity           numeric(12,4) not null default 1,
  credits_charged    bigint not null default 0,   -- lo que se le cobra al cliente (COP)
  provider           text,                        -- google, twilio, telnyx
  model              text,
  prompt_tokens      int,
  completion_tokens  int,
  total_tokens       int,
  provider_cost_usd  numeric(14,6) not null default 0,  -- costo real Noova
  provider_cost_cop  numeric(14,2) not null default 0,
  reference_type     text,
  reference_id       text,
  idempotency_key    text unique,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists usage_events_org_created_idx on public.usage_events (organization_id, created_at desc);
create index if not exists usage_events_org_type_idx on public.usage_events (organization_id, event_type);
create index if not exists usage_events_created_idx on public.usage_events (created_at desc);

-- ── Facturas mensuales ──────────────────────────────────────────────────────

create table if not exists public.billing_invoices (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  subscription_id   uuid references public.organization_subscriptions(id) on delete set null,
  plan_id           text,
  period_start      timestamptz not null,
  period_end        timestamptz not null,
  due_date          timestamptz not null,
  amount_usd        numeric(10,2) not null default 0,
  amount_cop        numeric(14,2) not null default 0,
  credits_included  bigint not null default 0,
  status            public.invoice_status not null default 'pending',
  paid_at           timestamptz,
  paid_by           uuid,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists billing_invoices_org_idx on public.billing_invoices (organization_id, created_at desc);
create index if not exists billing_invoices_status_idx on public.billing_invoices (status);
create unique index if not exists billing_invoices_org_period_idx on public.billing_invoices (organization_id, period_start);

-- ── Mapeo de planes legacy (trial/starter/pro/enterprise) ───────────────────

create or replace function public.billing_map_legacy_plan(p text)
returns text language sql immutable as $$
  select case lower(coalesce(p, ''))
    when 'trial' then 'explorador'
    when 'starter' then 'esencial'
    when 'pro' then 'crecimiento'
    when 'enterprise' then 'escala'
    when 'explorador' then 'explorador'
    when 'esencial' then 'esencial'
    when 'crecimiento' then 'crecimiento'
    when 'escala' then 'escala'
    else 'explorador'
  end;
$$;

-- ── Crear/actualizar suscripción + billetera + primera factura ──────────────

create or replace function public.billing_bootstrap_subscription(p_org uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pl public.plans%rowtype;
  ps timestamptz := now();
  pe timestamptz;
  trial_end timestamptz;
  st public.billing_status;
  sub_id uuid;
begin
  select * into pl from public.plans where id = p_plan;
  if not found then
    raise exception 'Plan % no existe', p_plan;
  end if;

  if pl.trial_days > 0 then
    trial_end := ps + (pl.trial_days || ' days')::interval;
    pe := trial_end;
    st := 'trialing';
  else
    trial_end := null;
    pe := ps + interval '1 month';
    st := 'active';
  end if;

  insert into public.organization_subscriptions
    (organization_id, plan_id, status, monthly_credits, price_usd,
     current_period_start, current_period_end, trial_ends_at, billing_day)
  values
    (p_org, pl.id, st, pl.monthly_credits, pl.price_usd, ps, pe, trial_end, extract(day from ps)::int)
  on conflict (organization_id) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    monthly_credits = excluded.monthly_credits,
    price_usd = excluded.price_usd,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    trial_ends_at = excluded.trial_ends_at,
    billing_day = excluded.billing_day,
    canceled_at = null,
    updated_at = now()
  returning id into sub_id;

  insert into public.organization_credit_wallets
    (organization_id, period_start, period_end, included_credits, used_credits)
  values (p_org, ps, pe, pl.monthly_credits, 0)
  on conflict (organization_id) do update set
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    included_credits = excluded.included_credits,
    used_credits = 0,
    updated_at = now();

  if pl.price_usd > 0 then
    insert into public.billing_invoices
      (organization_id, subscription_id, plan_id, period_start, period_end, due_date,
       amount_usd, amount_cop, credits_included, status)
    values
      (p_org, sub_id, pl.id, ps, pe, ps + interval '5 days',
       pl.price_usd, round(pl.price_usd * 4200), pl.monthly_credits, 'pending')
    on conflict (organization_id, period_start) do nothing;
  end if;
end;
$$;

-- ── Sincroniza el periodo de la billetera (vence créditos cada mes) ─────────

create or replace function public.billing_sync_wallet(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sub public.organization_subscriptions%rowtype;
  w public.organization_credit_wallets%rowtype;
  ps timestamptz;
  pe timestamptz;
begin
  select * into sub from public.organization_subscriptions where organization_id = p_org;
  if not found then
    return;
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
          topup_credits = case when topup_expires_at is not null and topup_expires_at <= now() then 0 else topup_credits end,
          updated_at = now()
    where organization_id = p_org;
  end if;
end;
$$;

-- ── Cobra créditos (incrementa consumo) y devuelve saldo ────────────────────

create or replace function public.billing_charge(p_org uuid, p_credits bigint)
returns table(remaining bigint, blocked boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.billing_sync_wallet(p_org);

  update public.organization_credit_wallets
    set used_credits = used_credits + greatest(coalesce(p_credits, 0), 0),
        updated_at = now()
  where organization_id = p_org;

  return query
    select (w.included_credits + w.topup_credits - w.used_credits)::bigint,
           ((w.included_credits + w.topup_credits - w.used_credits) <= 0)
    from public.organization_credit_wallets w
    where w.organization_id = p_org;
end;
$$;

-- ── ¿La organización puede consumir? (estado + saldo) ───────────────────────

create or replace function public.billing_can_consume(p_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sub public.organization_subscriptions%rowtype;
  w public.organization_credit_wallets%rowtype;
  rem bigint;
begin
  perform public.billing_sync_wallet(p_org);

  select * into sub from public.organization_subscriptions where organization_id = p_org;
  if not found then
    -- sin suscripción configurada: no se bloquea (facturación opt-in)
    return jsonb_build_object('allowed', true, 'reason', 'no_subscription', 'remaining', null);
  end if;

  if sub.status in ('suspended', 'canceled') then
    return jsonb_build_object('allowed', false, 'reason', sub.status::text, 'remaining', 0, 'status', sub.status::text);
  end if;

  select * into w from public.organization_credit_wallets where organization_id = p_org;
  rem := coalesce(w.included_credits + w.topup_credits - w.used_credits, 0);

  if rem <= 0 then
    return jsonb_build_object('allowed', false, 'reason', 'no_credits', 'remaining', rem, 'status', sub.status::text);
  end if;

  return jsonb_build_object('allowed', true, 'reason', 'ok', 'remaining', rem, 'status', sub.status::text);
end;
$$;

-- ── Marcar factura pagada (reactiva cuenta si estaba suspendida) ────────────

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
    set status = 'active', updated_at = now()
  where organization_id = inv.organization_id and status in ('suspended', 'past_due');

  update public.organizations
    set status = 'active', updated_at = now()
  where id = inv.organization_id and status = 'suspended';
end;
$$;

-- ── Renovaciones y bloqueos (ejecutar por cron diario) ──────────────────────

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

    -- 3) Renovar periodo si terminó
    if s.current_period_end <= now() then
      new_ps := s.current_period_end;
      new_pe := new_ps + interval '1 month';
      while new_pe <= now() loop
        new_ps := new_pe;
        new_pe := new_pe + interval '1 month';
      end loop;

      update public.organization_subscriptions
        set current_period_start = new_ps,
            current_period_end = new_pe,
            status = case when status = 'trialing' then 'active' else status end,
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

  return jsonb_build_object('overdue', n_overdue, 'suspended', n_suspended, 'renewed', n_renewed);
end;
$$;

-- ── Backfill: crear suscripción + billetera para organizaciones existentes ──

do $$
declare
  o record;
  mapped text;
begin
  for o in
    select org.id, org.plan, coalesce(pr.is_protected, false) as protected
    from public.organizations org
    left join public.profiles pr on pr.id = org.owner_user_id
  loop
    if o.protected then
      mapped := 'escala';
    else
      mapped := public.billing_map_legacy_plan(o.plan);
    end if;

    if not exists (select 1 from public.organization_subscriptions where organization_id = o.id) then
      perform public.billing_bootstrap_subscription(o.id, mapped);
    end if;
  end loop;
end $$;

-- ── Resumen de consumo por tipo de evento (panel del cliente) ──────────────

create or replace function public.billing_usage_summary(p_org uuid, p_from timestamptz, p_to timestamptz)
returns table(event_type text, events bigint, credits bigint, cost_cop numeric)
language sql
stable
security definer
set search_path = public
as $$
  select event_type,
         count(*)::bigint as events,
         coalesce(sum(credits_charged), 0)::bigint as credits,
         coalesce(sum(provider_cost_cop), 0)::numeric as cost_cop
  from public.usage_events
  where organization_id = p_org
    and created_at >= p_from
    and created_at < p_to
  group by event_type;
$$;

-- ── Overview de costos por org del periodo vigente (panel admin/proveedor) ──

create or replace function public.billing_admin_overview()
returns table(
  organization_id uuid,
  cost_cop numeric,
  credits_charged bigint,
  twilio_cost_cop numeric,
  google_cost_cop numeric,
  telnyx_cost_cop numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select ue.organization_id,
         coalesce(sum(ue.provider_cost_cop), 0)::numeric as cost_cop,
         coalesce(sum(ue.credits_charged), 0)::bigint as credits_charged,
         coalesce(sum(ue.provider_cost_cop) filter (where ue.provider = 'twilio'), 0)::numeric as twilio_cost_cop,
         coalesce(sum(ue.provider_cost_cop) filter (where ue.provider = 'google'), 0)::numeric as google_cost_cop,
         coalesce(sum(ue.provider_cost_cop) filter (where ue.provider = 'telnyx'), 0)::numeric as telnyx_cost_cop
  from public.usage_events ue
  join public.organization_credit_wallets w on w.organization_id = ue.organization_id
  where ue.created_at >= w.period_start
  group by ue.organization_id;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.plans enable row level security;
alter table public.organization_subscriptions enable row level security;
alter table public.organization_credit_wallets enable row level security;
alter table public.usage_events enable row level security;
alter table public.billing_invoices enable row level security;

-- plans: lectura autenticada
drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans
  for select to authenticated using (true);

-- helper inline: miembro activo de la org o platform admin
drop policy if exists org_subscriptions_select on public.organization_subscriptions;
create policy org_subscriptions_select on public.organization_subscriptions
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = organization_subscriptions.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );

drop policy if exists org_wallets_select on public.organization_credit_wallets;
create policy org_wallets_select on public.organization_credit_wallets
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = organization_credit_wallets.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );

drop policy if exists usage_events_select on public.usage_events;
create policy usage_events_select on public.usage_events
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = usage_events.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );

drop policy if exists billing_invoices_select on public.billing_invoices;
create policy billing_invoices_select on public.billing_invoices
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = billing_invoices.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );
