-- Renombra el evento de billing "hubspot_greeting" a "hubspot_send_message":
-- el nodo de HubSpot dejó de ser un todo-en-uno de saludo y pasó a ser un
-- nodo genérico "Enviar mensaje" (separado de "Crear o actualizar contacto"),
-- reutilizable para cualquier mensaje, no solo un saludo — ver
-- 100_hubspot_connector.sql / 101_billing_hubspot_greeting_price.sql.
--
-- Seguro de correr aunque nunca se haya insertado la fila anterior (instalación
-- fresca) ni haya usage_events que la referencien todavía (feature sin tráfico real).

update public.billing_unit_prices
set event_type = 'hubspot_send_message'
where event_type = 'hubspot_greeting';

insert into public.billing_unit_prices
  (event_type, label, description, unit_label, category, credits_cop, price_usd, sort_order, is_active)
values
  (
    'hubspot_send_message',
    'Mensaje enviado (HubSpot)',
    'Respuesta publicada en un hilo de Conversaciones de HubSpot vía el nodo ''Enviar mensaje''',
    'por mensaje',
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
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;
