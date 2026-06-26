-- Reportes de consumo cross-org para panel superadmin (con costo USD).

create or replace function public.billing_admin_consumption_by_org(
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  organization_id uuid,
  org_name text,
  plan_id text,
  sub_status text,
  event_type text,
  events bigint,
  credits bigint,
  cost_usd numeric,
  cost_cop numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id,
         o.name,
         sub.plan_id,
         sub.status::text,
         ue.event_type,
         count(*)::bigint,
         coalesce(sum(ue.credits_charged), 0)::bigint,
         coalesce(sum(ue.provider_cost_usd), 0)::numeric,
         coalesce(sum(ue.provider_cost_cop), 0)::numeric
  from public.usage_events ue
  join public.organizations o on o.id = ue.organization_id
  left join public.organization_subscriptions sub on sub.organization_id = o.id
  where ue.created_at >= p_from
    and ue.created_at < p_to
  group by o.id, o.name, sub.plan_id, sub.status, ue.event_type;
$$;

create or replace function public.billing_admin_consumption_totals(
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  events bigint,
  credits bigint,
  cost_usd numeric,
  cost_cop numeric,
  twilio_cost_usd numeric,
  google_cost_usd numeric,
  telnyx_cost_usd numeric,
  elevenlabs_cost_usd numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint,
         coalesce(sum(credits_charged), 0)::bigint,
         coalesce(sum(provider_cost_usd), 0)::numeric,
         coalesce(sum(provider_cost_cop), 0)::numeric,
         coalesce(sum(provider_cost_usd) filter (where provider = 'twilio'), 0)::numeric,
         coalesce(sum(provider_cost_usd) filter (where provider = 'google'), 0)::numeric,
         coalesce(sum(provider_cost_usd) filter (where provider = 'telnyx'), 0)::numeric,
         coalesce(sum(provider_cost_usd) filter (where provider = 'elevenlabs'), 0)::numeric
  from public.usage_events
  where created_at >= p_from
    and created_at < p_to;
$$;

create or replace function public.billing_admin_consumption_daily(
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  day date,
  event_type text,
  credits bigint,
  cost_usd numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select (created_at at time zone 'America/Bogota')::date,
         event_type,
         coalesce(sum(credits_charged), 0)::bigint,
         coalesce(sum(provider_cost_usd), 0)::numeric
  from public.usage_events
  where created_at >= p_from
    and created_at < p_to
  group by 1, 2
  order by 1;
$$;
