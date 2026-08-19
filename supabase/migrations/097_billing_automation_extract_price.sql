-- Línea de precio propia para "Extracción con IA (automatización)" (automation_extract).
-- Llamada de Gemini separada de la respuesta conversacional al cliente: llena los
-- campos estructurados que el tenant definió en el disparador de un workflow y los
-- manda al webhook. Consumo real (Gemini vía Ori) — necesita su propia línea
-- editable en /admin/pricing, igual que whatsapp_media_ai.

insert into public.billing_unit_prices
  (event_type, label, description, unit_label, category, credits_cop, price_usd, sort_order, is_active)
values
  (
    'automation_extract',
    'Extracción con IA (automatización)',
    'Campos estructurados definidos en un workflow, extraídos con Gemini y enviados al webhook',
    'por extracción',
    'whatsapp',
    50,
    round((50 / nullif(
      (select (bs.value::text)::numeric from public.billing_settings bs where bs.key = 'trm_cop'),
      0
    ))::numeric, 8),
    33,
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
