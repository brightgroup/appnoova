-- Línea de precio propia para "hubspot_greeting" — saludo automático enviado
-- por el nodo action.hubspot_greeting (contacto validado/creado + mensaje
-- publicado en un hilo de Conversaciones de HubSpot). Costo de proveedor 0
-- (la API de HubSpot no cobra por llamada, a diferencia de Twilio/Meta o los
-- modelos LLM) — es un cargo plano por saludo, mismo patrón de línea editable
-- en /admin/pricing que automation_extract (097).

insert into public.billing_unit_prices
  (event_type, label, description, unit_label, category, credits_cop, price_usd, sort_order, is_active)
values
  (
    'hubspot_greeting',
    'Saludo automático HubSpot',
    'Contacto validado/creado y saludo enviado en un hilo de Conversaciones de HubSpot',
    'por saludo',
    'automations',
    10,
    round((10 / nullif(
      (select (bs.value::text)::numeric from public.billing_settings bs where bs.key = 'trm_cop'),
      0
    ))::numeric, 8),
    34,
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
