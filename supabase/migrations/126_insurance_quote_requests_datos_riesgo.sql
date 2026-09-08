-- Extiende la cola de cotizaciones (migración 115) para calificar ramos sin
-- conector de aseguradora (vida, hogar) — `vehiculo` sigue siendo específico
-- de autos, `datos_riesgo` guarda los campos propios de cualquier otro ramo.
alter table public.insurance_quote_requests
  add column if not exists datos_riesgo jsonb not null default '{}'::jsonb;

comment on column public.insurance_quote_requests.datos_riesgo is
  'Datos específicos del riesgo para ramos sin conector de aseguradora (vida, hogar, etc.) — vehiculo sigue siendo específico de autos.';
