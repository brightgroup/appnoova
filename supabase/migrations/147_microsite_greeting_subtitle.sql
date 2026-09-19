-- El subtítulo de bienvenida de Mi Link era un texto fijo de seguros ("cotizar,
-- consultar pólizas, reportar siniestros") en el frontend, mostrado a todos los
-- tenants sin importar su rubro. Ahora es configurable por micrositio; null/vacío
-- cae a un mensaje genérico (ver DEFAULT_MICROSITE_GREETING).
alter table public.broker_microsites
  add column if not exists greeting_subtitle text;
