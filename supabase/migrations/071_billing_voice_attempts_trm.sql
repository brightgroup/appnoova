-- TRM real + tarifas por buzón e intento no contestado (campañas voz).

insert into public.billing_settings (key, value)
values ('trm_cop', '3350.68'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

insert into public.billing_settings (key, value)
values ('trm_effective_date', '"2026-07-07"'::jsonb)
on conflict (key) do nothing;

insert into public.billing_unit_prices
  (event_type, label, description, unit_label, category, credits_cop, price_usd, sort_order, is_active)
values
  (
    'voice_voicemail',
    'Buzón de voz',
    'Intento de campaña — contestadora detectada (sin conversación IA)',
    'por intento',
    'voice',
    270,
    round((270 / 3350.68)::numeric, 8),
    42,
    true
  ),
  (
    'voice_no_answer',
    'No contestada',
    'Intento de campaña — sin respuesta, ocupado o timeout AMD',
    'por intento',
    'voice',
    100,
    round((100 / 3350.68)::numeric, 8),
    43,
    true
  )
on conflict (event_type) do update set
  label = excluded.label,
  description = excluded.description,
  unit_label = excluded.unit_label,
  category = excluded.category,
  credits_cop = excluded.credits_cop,
  price_usd = excluded.price_usd,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

insert into public.billing_provider_rates
  (rate_key, provider, label, description, unit_label, cost_usd, sort_order)
values
  (
    'telnyx_amd_premium',
    'telnyx',
    'AMD Premium Telnyx',
    'Detección de buzón por llamada de campaña',
    'por detección',
    0.0065,
    22
  ),
  (
    'voice_attempt_telnyx',
    'telnyx',
    'Intento saliente Telnyx',
    'Timbrado y conexión corta sin conversación',
    'por intento',
    0.012,
    23
  )
on conflict (rate_key) do update set
  label = excluded.label,
  description = excluded.description,
  unit_label = excluded.unit_label,
  cost_usd = excluded.cost_usd,
  sort_order = excluded.sort_order;

-- Recalcular price_usd desde credits_cop con TRM vigente.
update public.billing_unit_prices u
set price_usd = round((u.credits_cop / nullif(
  (select (bs.value::text)::numeric from public.billing_settings bs where bs.key = 'trm_cop'),
  0
))::numeric, 8)
where u.credits_cop > 0;
