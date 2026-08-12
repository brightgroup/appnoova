-- Línea de precio propia para "Imagen/PDF por WhatsApp" (whatsapp_media_ai).
-- Antes ese análisis iba escondido dentro del precio plano de whatsapp_ai, sin
-- que el admin pudiera verlo ni editarlo por separado en /admin/pricing.

insert into public.billing_unit_prices
  (event_type, label, description, unit_label, category, credits_cop, price_usd, sort_order, is_active)
values
  (
    'whatsapp_media_ai',
    'Imagen/PDF por WhatsApp',
    'Análisis de imagen o documento adjunto (Gemini o Claude, según el modelo del agente)',
    'por archivo',
    'whatsapp',
    90,
    round((90 / nullif(
      (select (bs.value::text)::numeric from public.billing_settings bs where bs.key = 'trm_cop'),
      0
    ))::numeric, 8),
    32,
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
