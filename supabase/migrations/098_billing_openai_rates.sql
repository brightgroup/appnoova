-- Tarifas de GPT-4o mini (OpenAI), motor primario de los agentes de texto nuevos
-- (failover automático con Gemini Flash — ver src/lib/llm/engines.ts) y desglose de
-- OpenAI en los totales de consumo admin. Sin esto, cualquier usage_event con
-- provider = 'openai' entra en el total general pero no aparece en ningún bucket
-- del desglose por proveedor (billing_admin_consumption_totals tiene columnas fijas
-- por proveedor, no es dinámica).

insert into public.billing_provider_rates
  (rate_key, provider, label, description, unit_label, cost_usd, sort_order)
values
  (
    'openai_4o_mini_input_per_m',
    'openai',
    'GPT-4o mini entrada',
    null,
    'por millón tokens',
    0.15,
    50
  ),
  (
    'openai_4o_mini_output_per_m',
    'openai',
    'GPT-4o mini salida',
    null,
    'por millón tokens',
    0.6,
    51
  )
on conflict (rate_key) do update set
  label = excluded.label,
  description = excluded.description,
  unit_label = excluded.unit_label,
  cost_usd = excluded.cost_usd,
  sort_order = excluded.sort_order;

-- Postgres no permite cambiar el set de columnas de salida con CREATE OR REPLACE.
drop function if exists public.billing_admin_consumption_totals(timestamptz, timestamptz);

create function public.billing_admin_consumption_totals(
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
  elevenlabs_cost_usd numeric,
  meta_cost_usd numeric,
  anthropic_cost_usd numeric,
  openai_cost_usd numeric
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
         coalesce(sum(provider_cost_usd) filter (where provider = 'elevenlabs'), 0)::numeric,
         coalesce(sum(provider_cost_usd) filter (where provider = 'meta'), 0)::numeric,
         coalesce(sum(provider_cost_usd) filter (where provider = 'anthropic'), 0)::numeric,
         coalesce(sum(provider_cost_usd) filter (where provider = 'openai'), 0)::numeric
  from public.usage_events
  where created_at >= p_from
    and created_at < p_to;
$$;
