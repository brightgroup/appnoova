-- Recalibra el precio de "Cotización" (quote): el script de verificación
-- (scripts/billing-cost-check.ts) mostró que 70 créditos cubre solo ~28% de
-- margen contra el costo real de Gemini Pro para una cotización típica.
-- Sube a 90 créditos (mismo valor que "Escaneo de documento"), ~44% de margen.

update public.billing_unit_prices
set credits_cop = 90,
    price_usd = round((90 / nullif(
      (select (bs.value::text)::numeric from public.billing_settings bs where bs.key = 'trm_cop'),
      0
    ))::numeric, 8),
    updated_at = now()
where event_type = 'quote';
