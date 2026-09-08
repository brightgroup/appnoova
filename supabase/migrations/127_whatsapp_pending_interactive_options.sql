-- Bug encontrado probando el cotizador de seguros por WhatsApp (2026-09-08):
-- Twilio, para un `twilio/list-picker`, manda de vuelta en `Body` el ID interno
-- de la fila elegida (ej. "opt_1"), no su texto — a diferencia de
-- `twilio/quick-reply`, donde `Body` sí trae el texto del botón. Sin resolver
-- ese ID antes de pasarlo al agente, la IA recibe "opt_1" como si el cliente
-- lo hubiera escrito, no lo reconoce como respuesta y vuelve a preguntar lo
-- mismo en bucle. Esta tabla guarda, por contacto+canal, el mapa id→texto de
-- la última lista/botones enviados, para resolverlo en el webhook de entrada
-- antes de que el mensaje llegue a cualquier otra parte del pipeline.
create table if not exists public.whatsapp_pending_interactive_options (
  id                    uuid primary key default gen_random_uuid(),
  whatsapp_channel_id   uuid not null references public.whatsapp_channels(id) on delete cascade,
  contact_e164          text not null,
  options               jsonb not null,
  created_at            timestamptz not null default now(),
  unique (whatsapp_channel_id, contact_e164)
);

comment on table public.whatsapp_pending_interactive_options is
  'Mapa id→texto de la última lista/botones interactivos enviados a un contacto — se consume (y se borra) en el próximo mensaje entrante para resolver el ID que Twilio devuelve en list-picker.';
