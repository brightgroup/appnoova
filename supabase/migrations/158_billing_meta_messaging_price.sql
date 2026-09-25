-- Línea de precio propia para "Messenger/Instagram con IA" (meta_messaging_ai).
-- A diferencia de whatsapp_ai, Meta no cobra la entrega en Messenger/Instagram:
-- el turno cubre solo el LLM con margen. Editable en /admin/pricing.

insert into public.billing_unit_prices
  (event_type, label, description, unit_label, category, credits_cop, price_usd, sort_order, is_active)
values
  (
    'meta_messaging_ai',
    'Messenger/Instagram con IA',
    'Turno completo: cliente escribe + IA responde (Meta no cobra la entrega)',
    'por turno',
    'social',
    30,
    round((30 / nullif(
      (select (bs.value::text)::numeric from public.billing_settings bs where bs.key = 'trm_cop'),
      0
    ))::numeric, 8),
    35,
    true
  )
on conflict (event_type) do nothing;
