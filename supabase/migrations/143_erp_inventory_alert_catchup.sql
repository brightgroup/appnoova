-- ERP > Inventario: recuperación ("catch-up") del resumen diario de stock mínimo.
--
-- Bug reportado por un cliente (C market solutions, hora_resumen=18): el cron
-- de GitHub Actions (erp-inventory-alerts-cron.yml) declara `0 * * * *` pero
-- GitHub NO garantiza esa cadencia — bajo carga puede atrasar o SALTAR por
-- completo la ejecución de una hora (confirmado en el historial de runs: hubo
-- días donde pasó de hour_checked=17 directo a hour_checked=19, sin ningún run
-- en la ventana 23:00–23:59 UTC = 18:00–18:59 Bogotá). Como
-- /api/cron/erp-inventory-alerts solo enviaba cuando `hora_resumen ===
-- currentHour` exactamente, si esa hora se salta el resumen de ese día se
-- pierde para siempre — no había manera de "alcanzarlo" más tarde.
--
-- Fix: guardamos la última fecha (hora Bogotá) en que ya se procesó el resumen
-- diario de cada organización. El cron ahora dispara para toda organización
-- con `hora_resumen <= hora_actual` que NO se haya procesado hoy todavía, sin
-- importar si el run llega tarde o si se saltó su hora exacta. Sigue sin
-- reenviar dos veces el mismo día ni disparar antes de la hora configurada.

alter table public.erp_inventory_alert_rules
  add column if not exists ultimo_resumen_enviado_en date;

comment on column public.erp_inventory_alert_rules.ultimo_resumen_enviado_en is
  'Fecha (hora America/Bogota) en que el cron ya procesó el resumen diario de esta organización — permite recuperar el envío si el run de GitHub Actions llega tarde o se saltó la hora_resumen exacta ese día, en vez de perder el resumen del día.';
