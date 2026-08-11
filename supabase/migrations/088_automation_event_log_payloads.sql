-- Payload real por ejecución — para poder inspeccionar el JSON exacto que salió
-- o entró en cada evento de automatización, igual que el inspector de
-- ejecuciones de n8n. Se trunca a nivel de aplicación antes de insertar.

alter table public.automation_event_log
  add column if not exists request_body text,
  add column if not exists response_body text;

comment on column public.automation_event_log.request_body is
  'JSON enviado (evento saliente hacia un conector) o recibido (callback entrante) en este evento — truncado a ~8000 caracteres.';
comment on column public.automation_event_log.response_body is
  'Cuerpo de la respuesta HTTP recibida del conector, si aplica (solo en el envío saliente) — truncado a ~8000 caracteres.';
