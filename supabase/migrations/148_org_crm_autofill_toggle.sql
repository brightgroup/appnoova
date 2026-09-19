-- Interruptor por organización: si la IA crea/actualiza contactos y leads del
-- CRM automáticamente desde Mi Link y el widget web (WhatsApp no tiene este
-- interruptor, siempre lo hace). Apagado por defecto — decisión explícita del
-- negocio: cada tenant lo prende desde Configuración CRM > Automatización
-- cuando quiera este comportamiento.
alter table public.organizations
  add column if not exists crm_autofill_enabled boolean not null default false;
