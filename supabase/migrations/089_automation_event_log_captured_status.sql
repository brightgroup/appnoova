-- Nuevo estado 'captured': el disparador de un workflow se activó con datos
-- reales (imagen/texto de WhatsApp, o una llamada a un trigger.webhook) pero
-- todavía no hay ningún nodo de acción conectado — se loguea de todas formas
-- para que el botón "Escuchar evento de prueba" del editor tenga datos reales
-- desde el primer momento, sin esperar a que el workflow esté terminado.

alter table public.automation_event_log
  drop constraint if exists automation_event_log_status_check;

alter table public.automation_event_log
  add constraint automation_event_log_status_check
  check (status in ('sent', 'responded', 'no_response', 'error', 'captured'));
