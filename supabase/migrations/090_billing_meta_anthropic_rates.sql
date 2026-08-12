-- Tarifas de referencia para Meta WhatsApp Cloud API directo y Claude (Anthropic),
-- más el desglose de esos dos proveedores en los totales de consumo admin.
-- Antes el costo de Meta directo se computaba en $0 (no existía la tarifa) y el
-- costo de Claude no tenía ningún bucket propio en el desglose por proveedor.

insert into public.billing_provider_rates
  (rate_key, provider, label, description, unit_label, cost_usd, sort_order)
values
  (
    'meta_wa_per_msg',
    'meta',
    'Meta WhatsApp Cloud API',
    'Referencia por mensaje (Meta cobra por ventana de conversación de 24h)',
    'por mensaje',
    0.005,
    11
  ),
  (
    'anthropic_haiku_input_per_m',
    'anthropic',
    'Claude Haiku 4.5 entrada',
    null,
    'por millón tokens',
    1,
    40
  ),
  (
    'anthropic_haiku_output_per_m',
    'anthropic',
    'Claude Haiku 4.5 salida',
    null,
    'por millón tokens',
    5,
    41
  ),
  (
    'anthropic_sonnet_input_per_m',
    'anthropic',
    'Claude Sonnet 5 entrada',
    null,
    'por millón tokens',
    3,
    42
  ),
  (
    'anthropic_sonnet_output_per_m',
    'anthropic',
    'Claude Sonnet 5 salida',
    null,
    'por millón tokens',
    15,
    43
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
  anthropic_cost_usd numeric
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
         coalesce(sum(provider_cost_usd) filter (where provider = 'anthropic'), 0)::numeric
  from public.usage_events
  where created_at >= p_from
    and created_at < p_to;
$$;
