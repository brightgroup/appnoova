-- Consumo cross-org agrupado por PROVEEDOR (Twilio, Meta, Google, Anthropic,
-- Telnyx, ElevenLabs) en vez de por tipo de evento — para responder
-- directamente "qué cliente me está gastando cuánto en Gemini/Claude/Twilio".
-- Complementa (no reemplaza) billing_admin_consumption_by_org, que agrupa por
-- event_type/servicio.

create function public.billing_admin_consumption_by_org_provider(
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  organization_id uuid,
  org_name text,
  plan_id text,
  sub_status text,
  provider text,
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
         coalesce(ue.provider, 'otro'),
         count(*)::bigint,
         coalesce(sum(ue.credits_charged), 0)::bigint,
         coalesce(sum(ue.provider_cost_usd), 0)::numeric,
         coalesce(sum(ue.provider_cost_cop), 0)::numeric
  from public.usage_events ue
  join public.organizations o on o.id = ue.organization_id
  left join public.organization_subscriptions sub on sub.organization_id = o.id
  where ue.created_at >= p_from
    and ue.created_at < p_to
  group by o.id, o.name, sub.plan_id, sub.status, coalesce(ue.provider, 'otro');
$$;
